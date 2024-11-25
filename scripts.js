const userName = "Rob-"+Math.floor(Math.random() * 100000)
const password = "x";
document.querySelectorAll('.user-name').forEach(div => {
    div.textContent = userName;
  });


//if trying it on a phone, use this instead...
const socket = io.connect('https://147.175.176.81:8181/',{
//const socket = io.connect('https://localhost:8181/',{
    auth: {
        userName,password
    }
})

const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;

let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

//when a client initiates a call
const call = async e=>{
    await fetchUserMedia();

    //peerConnection is all set with our STUN servers sent over
    await createPeerConnection();

    //create offer time!
    try{
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log(offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer',offer); //send offer to signalingServer
    }catch(err){
        console.log(err)
    }

}

const answerOffer = async(offerObj)=>{
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); //just to make the docs happy
    await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
    console.log(offerObj)
    console.log(answer)
    // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
    //add the answer to the offerObj so the server knows which offer this is related to
    offerObj.answer = answer 
    //emit the answer to the signaling server, so it can emit to CLIENT1
    //expect a response from the server with the already existing ICE candidates
    const offerIceCandidates = await socket.emitWithAck('newAnswer',offerObj)
    offerIceCandidates.forEach(c=>{
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log(offerIceCandidates)
}

const addAnswer = async(offerObj)=>{
    //addAnswer is called in socketListeners when an answerResponse is emitted.
    //at this point, the offer and answer have been exchanged!
    //now CLIENT1 needs to set the remote
    await peerConnection.setRemoteDescription(offerObj.answer)
    // console.log(peerConnection.signalingState)
}
const fetchUserMedia = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true, // Enable audio
            });

            // Set the local video element's source to the local stream
            localVideoEl.srcObject = stream;

            // Store the stream in the localStream variable
            localStream = stream;

            // Mute the local audio to prevent it from playing back through your speakers
            const audioTracks = stream.getAudioTracks();
            audioTracks.forEach(track => track.enabled = false);  // Disable local audio playback

            resolve();  // Resolve the promise when successful
        } catch (err) {
            console.log('Error accessing media devices:', err);
            reject();  // Reject the promise if an error occurs
        }
    });
}; 


const createPeerConnection = (offerObj)=>{
    return new Promise(async(resolve, reject)=>{
        //RTCPeerConnection is the thing that creates the connection
        //we can pass a config object, and that config object can contain stun servers
        //which will fetch us ICE candidates
        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteVideoEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track=>{
            //add localtracks so that they can be sent once the connection is established
            peerConnection.addTrack(track,localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate',e=>{
            console.log('........Ice candidate found!......')
            console.log(e)
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer',{
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })    
            }
        })
        
        peerConnection.addEventListener('track',e=>{
            console.log("Got a track from the other peer!! How excting")
            console.log(e)
            e.streams[0].getTracks().forEach(track=>{
                remoteStream.addTrack(track,remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if(offerObj){
            //this won't be set when called from call();
            //will be set when we call from answerOffer()
            // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
            await peerConnection.setRemoteDescription(offerObj.offer)
            // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
        }
        resolve();
    })
}

const addNewIceCandidate = iceCandidate=>{
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}

const hangupCall = () => {
    if (peerConnection) {
        // Close the peer connection
        peerConnection.close();
        peerConnection = null;
        console.log("Call ended, peer connection closed.");
    }

    if (localStream) {
        // Stop all tracks in the local stream
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        console.log("Local video stream stopped.");
    }

    // Clear the video elements
    localVideoEl.srcObject = null;
    remoteVideoEl.srcObject = null;

    // Notify the signaling server (optional, depends on server-side logic)
    socket.emit('hangup', { userName });
};

// Initialize a flag to track the camera state
let isCameraOff = true;

// Reference the button element for toggling the camera
const toggleCameraButton = document.querySelector('#toggle-camera');

// Function to toggle the camera
const toggleCamera = () => {
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            track.enabled = !isCameraOff; // Toggle the enabled state
        });
    }

    // Toggle the camera state
    isCameraOff = !isCameraOff;

    // Update the button text immediately after toggling
    toggleCameraButton.textContent = isCameraOff ? 'Turn Camera Off' : 'Turn Camera On';

    console.log(`Camera is now ${isCameraOff ? 'off' : 'on'}.`);
};

// Set the initial button text to match the current camera state
toggleCameraButton.textContent = isCameraOff ? 'Turn Camera Off' : 'Turn Camera On';

// Event listener for the toggle camera button
toggleCameraButton.addEventListener('click', toggleCamera);


//SCREEN SHARING
let screenStream = null; // To store the screen-sharing stream

// Reference the screen sharing button
const shareScreenButton = document.querySelector('#share-screen');

// Function to start/stop screen sharing
const toggleScreenSharing = async () => {
    if (!screenStream) {
        try {
            // Start screen sharing
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false, // Audio can be included if needed
            });

            // Replace the video track in the peer connection if it exists
            if (peerConnection && localStream) {
                const videoTrack = screenStream.getVideoTracks()[0];
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack); // Replace the local video track with the screen-sharing track
                }
            }

            // Display the screen-sharing stream locally
            localVideoEl.srcObject = screenStream;

            // Listen for when the user stops screen sharing
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenSharing();
            });

            shareScreenButton.textContent = 'Stop Sharing';
            console.log('Screen sharing started');
        } catch (err) {
            console.error('Error starting screen sharing:', err);
        }
    } else {
        // Stop screen sharing
        stopScreenSharing();
    }
};

// Function to stop screen sharing
const stopScreenSharing = () => {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop()); // Stop all tracks
        screenStream = null;

        // Revert to the local video stream
        if (peerConnection && localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack); // Replace the screen-sharing track with the local video track
            }
        }

        // Display the local video stream
        localVideoEl.srcObject = localStream;

        shareScreenButton.textContent = 'Share Screen';
        console.log('Screen sharing stopped');
    }
};

// Add event listener to the button
shareScreenButton.addEventListener('click', toggleScreenSharing);

// AUDIO 
// Initialize a flag to track mute state
let isAudioMuted = true;

// Reference the button element
const toggleAudioButton = document.querySelector('#toggle-audio');

// Function to toggle audio
const toggleAudio = () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isAudioMuted; // Toggle the enabled state
        });
    }

    // Toggle the mute state
    isAudioMuted = !isAudioMuted;

    // Update the button text immediately after toggling
    toggleAudioButton.textContent = isAudioMuted ? 'Mute Audio' : 'Unmute Audio';

    console.log(`Audio is now ${isAudioMuted ? 'muted' : 'unmuted'}.`);
};

// Set the initial button text to match the current audio state
toggleAudioButton.textContent = isAudioMuted ? 'Mute Audio' : 'Unmute Audio';

// Event listener for the toggle button
toggleAudioButton.addEventListener('click', toggleAudio);


document.querySelector('#call').addEventListener('click',call)

document.querySelector('#hangup').addEventListener('click', hangupCall);
