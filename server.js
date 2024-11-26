
const fs = require('fs');
const https = require('https');
const express = require('express');
const socketio = require('socket.io');

const app = express();
const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');

const expressServer = https.createServer({ key, cert }, app);
const io = socketio(expressServer, {
    cors: {
        origin: ["https://localhost", "https://147.175.176.81"],
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

expressServer.listen(8181, () => {
    console.log("Server listening on port 8181");
});

const connectedUsers = {}; // { userName: socketId }

io.on('connection', (socket) => {
    const { userName, password } = socket.handshake.auth;

    if (password !== "x") {
        socket.disconnect(true);
        return;
    }

    connectedUsers[userName] = socket.id;

    // Notify everyone about the new user
    io.emit('userList', Object.keys(connectedUsers));

    console.log(`${userName} connected`);

    socket.on('disconnect', () => {
        delete connectedUsers[userName];
        io.emit('userList', Object.keys(connectedUsers));
        console.log(`${userName} disconnected`);
    });

    socket.on('newOffer', (data) => {
        const { offer, targetUser } = data;

        // Broadcast the offer to all other users
        socket.broadcast.emit('incomingOffer', { from: userName, offer });
    });

    socket.on('newAnswer', (data) => {
        const { answer, targetUser } = data;

        // Send the answer to the original offerer
        const targetSocketId = connectedUsers[targetUser];
        if (targetSocketId) {
            io.to(targetSocketId).emit('incomingAnswer', { from: userName, answer });
        }
    });

    socket.on('sendIceCandidateToSignalingServer', (data) => {
        const { iceCandidate, peerUserName } = data;

        // Relay ICE candidate to the intended recipient
        const targetSocketId = connectedUsers[peerUserName];
        if (targetSocketId) {
            io.to(targetSocketId).emit('incomingIceCandidate', { from: userName, candidate: iceCandidate });
        }
    });
});
