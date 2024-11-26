const userName = "User-" + Math.floor(Math.random() * 100000); // Unique username for each client
const password = "x"; // Authentication password
document.querySelectorAll('.user-name').forEach(div => {
    div.textContent = userName;
});

// Socket connection
const socket = io.connect('https://147.175.176.81:8181/', {
    auth: { userName, password }
});

const localVideoEl = document.querySelector('#local-video');
const remoteVideosContainer = document.querySelector('#videos'); // Container for remote video elements
const assignedRemoteVideos = {}; // Map of peerUserName to dynamically created video elements

let localStream; // Local media stream
let userList = []; // List of all participants
const peerConnections = {}; // Active connections by peerUserName

// STUN server configuration
const peerConfiguration = {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
};

// Fetch user media for local stream
const fetchUserMedia = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoEl.srcObject = stream;
        localStream = stream;
        console.log("Local stream fetched.");
    } catch (err) {
        console.error("Error accessing media devices:", err);
    }
};

// Dynamically create a new video element for a remote participant
const createRemoteVideoElement = (peerUserName) => {
    if (assignedRemoteVideos[peerUserName]) {
        return assignedRemoteVideos[peerUserName];
    }

    const videoEl = document.createElement('video');
    videoEl.id = `remote-video-${peerUserName}`;
    videoEl.className = 'video-player';
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    remoteVideosContainer.appendChild(videoEl);

    assignedRemoteVideos[peerUserName] = videoEl;
    return videoEl;
};
const createPeerConnection = (peerUserName) => {
    console.log(`Creating peer connection for ${peerUserName}`);
    const peerConnection = new RTCPeerConnection(peerConfiguration);
    const remoteStream = new MediaStream();
    const videoEl = createRemoteVideoElement(peerUserName);

    videoEl.srcObject = remoteStream;

    peerConnections[peerUserName] = peerConnection;

    // Add local stream tracks
    localStream.getTracks().forEach(track => {
        console.log(`Adding local track for ${peerUserName}`);
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
        console.log(`Received track for ${peerUserName}`);
        event.streams[0].getTracks().forEach(track => {
            console.log(`Adding remote track for ${peerUserName}`);
            remoteStream.addTrack(track);
        });
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate for ${peerUserName}`);
            socket.emit('sendIceCandidateToSignalingServer', {
                iceCandidate: event.candidate,
                peerUserName: peerUserName
            });
        }
    };

    return peerConnection;
};

socket.on('userList', (users) => {
    userList = users.filter((user) => user !== userName);
    console.log("Updated user list:", userList);
});




// Initiate a call with all participants
const call = async () => {
    await fetchUserMedia();

    for (const participant of userList) {
        if (!peerConnections[participant]) {
            const peerConnection = createPeerConnection(participant);
            if (!peerConnection) continue;

            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                console.log(`Sending offer to ${participant}`);
                socket.emit('newOffer', { offer, targetUser: participant });
            } catch (err) {
                console.error("Error creating offer:", err);
            }
        }
    }
};

// Handle incoming offer

socket.on('incomingOffer', async (offerObj) => {
    const peerUserName = offerObj.from;

    console.log(`Received offer from ${peerUserName}`);
    let peerConnection = peerConnections[peerUserName];

    if (!peerConnection) {
        peerConnection = createPeerConnection(peerUserName);
    }

    try {
        if (peerConnection.signalingState === 'stable') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offerObj.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            console.log(`Sending answer to ${peerUserName}`);
            socket.emit('newAnswer', { answer, targetUser: peerUserName });
        } else {
            console.error(
                `Cannot set remote offer for ${peerUserName}. Current signaling state: ${peerConnection.signalingState}`
            );
        }
    } catch (error) {
        console.error(`Error handling offer from ${peerUserName}:`, error);
    }
});

// Handle incoming answer


socket.on('incomingAnswer', async (answerObj) => {
    const peerConnection = peerConnections[answerObj.from];

    if (!peerConnection) {
        console.error(`No peer connection found for ${answerObj.from}`);
        return;
    }

    try {
        if (peerConnection.signalingState === 'have-local-offer') {
            console.log(`Received answer from ${answerObj.from}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answerObj.answer));
        } else {
            console.error(
                `Cannot set remote answer for ${answerObj.from}. Current signaling state: ${peerConnection.signalingState}`
            );
        }
    } catch (error) {
        console.error(`Error handling answer from ${answerObj.from}:`, error);
    }
});

// Handle incoming ICE candidates

socket.on('incomingIceCandidate', (iceCandidateObj) => {
    const peerConnection = peerConnections[iceCandidateObj.from];
    if (peerConnection) {
        console.log(`Adding ICE candidate from ${iceCandidateObj.from}`);
        peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidateObj.candidate));
    }
});

// Hang up the call
const hangupCall = () => {
    console.log("Hanging up the call.");
    Object.values(peerConnections).forEach(conn => conn.close());
    Object.keys(peerConnections).forEach(key => delete peerConnections[key]);

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    localVideoEl.srcObject = null;
    Object.keys(assignedRemoteVideos).forEach((key) => {
        const videoEl = assignedRemoteVideos[key];
        videoEl.parentElement.removeChild(videoEl); // Remove video element from DOM
        delete assignedRemoteVideos[key];
    });

    console.log("Call ended.");
};
// Attach event listeners
document.querySelector('#call').addEventListener('click', call);
document.querySelector('#hangup').addEventListener('click', hangupCall);

//kokotiny

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




