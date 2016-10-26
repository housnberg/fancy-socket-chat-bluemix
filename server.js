/*
 * Import of the express module.
 */
var express = require('express');
var	app = express();
var	server = require('http').createServer(app);
var	io = require('socket.io').listen(server);

/*
 * ALlows to stream binary data.
 */
var fs = require("fs");
var ss = require('socket.io-stream');
var path = require('path');

/*
 * Decouple the server functionality from the routing functionality.
 * So use router as an own module.
 */
var router = require('./routs')(io);

/*
 * Array for all connected users.
 */
var connectedUsers = new Array();
var userMap = new Map();

/*
 * Load Server Config file.
 */
var config = require('./config.json');

server.listen(config.port, function () {
    console.log('##### listening on  port ' + config.port);
});

app.use('/', router);

io.on('connection', function(socket) {
    
    /*
     * Handle user connection.
     */
    socket.on('user join', function(userName, isJoinedFunc) {
        if (connectedUsers.indexOf(userName) == -1) {
            isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
            socket.userName = userName; //Assign username to socket so you can use it later
            connectedUsers.push(userName);
            io.emit('user join leave', {userName: userName, timeStamp: getCurrentDate(), isJoined: true});   
        } else {
            io.emit('error', {errorMessage: "the user with the username '" + userName + "' already exists."})
        }
    });
    
    /*
    * Handle chat message submisson
    */
    socket.on('chat message', function(msg) {
        if (isAuthenticated(socket)) {
            var data = {userName: socket.userName, message: msg, timeStamp: getCurrentDate(), own: false};
            socket.broadcast.emit('chat message', data); //Broadcast message to all users except me.
            data.own = true;
            socket.emit('chat message', data); //Send message only to me   
        }
    });

    /*
     * Handle user disconnection.
     */
        userMap.set(socket.userName,socket);
    socket.on('disconnect', function() {
        if (isAuthenticated(socket)) {
            io.emit('user join leave', {userName: socket.userName, timeStamp: getCurrentDate(), isJoined: false});
        }
        var pos = connectedUsers.indexOf(socket.userName);
        connectedUsers.splice(pos,1);
    });

    /*
     * Handle request of current users
     */
    socket.on('user list', function () {
        if (isAuthenticated(socket)) {
            socket.emit('user list', {users: connectedUsers, timeStamp: getCurrentDate()}); //Send message to me (allows to define different styles)
        }
    });

    /*
     * Handle submission of a file
     */
    ss(socket).on('file', function(stream, data) {
        if (isAuthenticated(socket)) {
            var filename = config.filePath + path.basename(data.fileName);
            //Neither "finish", "close" NOR "end" callbacks are working -> BUG
            //We have to emit the Link data althought the data upload is not finished. 
            stream.pipe(fs.createWriteStream(filename));
            var newData = {filePath: config.filePath, fileName: data.fileName, timeStamp: getCurrentDate(), userName: socket.userName, own: false};
            socket.broadcast.emit('file', newData);
            newData.own = true;
            socket.emit('file', newData);
        }
    });  
    
});

/*
 * Check if the user is authenticated.
 */
function isAuthenticated(socket) {
    //There is no socket available. Therefore the user cannot be autzhenticated.
    if (socket === undefined) {
        return false;
    }
    if (socket.userName !== undefined) {
        return true;
    }
}

/*
 * Returns the current Time in the format HH:MM:SS
 */
function getCurrentDate() {
    var now = new Date(Date.now());
    return now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
}
