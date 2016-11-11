var LOCALE = 'de-DE';

/*
 * Import of the express module.
 */
var express = require('express');
var	app = express();
var	server = require('http').createServer(app);
var	io = require('socket.io').listen(server);

var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();

// Load the Cloudant library.
var Cloudant = require('cloudant');

/*
 * ALlows to stream binary data.
 */
var fs = require("fs");
var ss = require('socket.io-stream');
var path = require('path');

/*
 * Decouple the server functionality from the routing functionality.
 * Use routing as an own module.
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

var services = null;
var credentials = null;

/*
 * Search for the cloudant service.
 */
if (process.env.VCAP_SERVICES) {
	services = JSON.parse(process.env.VCAP_SERVICES);

	var cloudantService = services['cloudantNoSQLDB'];
	for (var index in cloudantService) {
		if (cloudantService[index].name === 'cloudant-nosql-db') {
			credentials = cloudantService[index].credentials;
		}
	}
} else {
	console.log("ERROR: Cloudant Service was not bound!");
}

var cloudant = Cloudant(credentials.url);

var database = cloudant.db.use('fancy-socket-chat');
if (database === undefined) {
    console.log("ERROR: The database with the name 'fancy-socket-chat' is not defined. You have to define it before you can use the database.")
}

cloudant.db.list(function(err, allDbs) {
  console.log('All my databases: %s', allDbs.join(', '))
});

var cloudant = Cloudant(credentials.url);

cloudant.db.list(function(err, allDbs) {
  console.log('All my databases: %s', allDbs.join(', '))
});

app.use('/', router);

io.on('connection', function(socket) {
    
    /*
     * Handle user join.
     */
    socket.on('user join', function(userName, isJoinedFunc) {
        if (connectedUsers.indexOf(userName) == -1) {
            isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
            socket.userName = userName; //Assign username to socket so you can use it later
            connectedUsers.push(userName);
            io.emit('user join leave', {userName: userName, timeStamp: getTimestamp(), isJoined: true});   
            userMap.set(socket.userName, socket);
        } else {
            //Indicate that the username is already taken.
            isJoinedFunc(false);
        }
    });
    
    /*
    * Handle chat message submisson.
    */
    socket.on('chat message', function(msg) {
        if (isAuthenticated(socket)) {
            var data = {userName: socket.userName, message: msg, timeStamp: getTimestamp(true), own: false};
            //Broadcast message to all users except me.
            socket.broadcast.emit('chat message', data);
            data.own = true;
            //Send message only to me   
            socket.emit('chat message', data);
        }
    });

    /*
     * Handle user disconnection.
     */
    socket.on('disconnect', function() {
        if (isAuthenticated(socket)) {
            var pos = connectedUsers.indexOf(socket.userName);
            connectedUsers.splice(pos, 1);
            io.emit('user join leave', {userName: socket.userName, timeStamp: getTimestamp(), isJoined: false});
        }
    });

    /*
     * Handle request of a list of all current users.
     */
    socket.on('user list', function () {
        if (isAuthenticated(socket)) {
            socket.emit('user list', {users: connectedUsers, timeStamp: getTimestamp(true)}); //Send message to me (allows to define different styles)
        }
    });

    /*
     * Handle direct message submission.
     */
    socket.on('direct message', function (msg) {
        var userName = msg.substr(0, msg.indexOf(' ')).replace('@','');
        var message = msg.substr(msg.indexOf(' ') + 1);
        
        var tempSocket = userMap.get(userName);
        var data = {userName: socket.userName, message: message, timeStamp: getTimestamp(true), own: false, direct: true};
        
        //If socketName is undefined or null there is no user with this name available.
        //Don't allow the send a private message to yourself.
        if (tempSocket !== undefined && tempSocket != null && tempSocket != socket) {
            tempSocket.emit('chat message', data); //Broadcast message to all users except me.
            data.own = true;
            socket.emit('chat message', data); //Send message only to me   
        }
    });
    
    /*
     * Handle submission of a file.
     */
    ss(socket).on('file', function(stream, data) {
        if (isAuthenticated(socket)) {
            var filename = config.filePath + path.basename(data.fileName);
            //Neither "finish", "close" NOR "end" callbacks are working -> BUG
            //We have to emit the Link data althought the data upload is not finished. 
            stream.pipe(fs.createWriteStream(filename));
            var newData = {filePath: config.filePath, fileName: data.fileName, timeStamp: getTimestamp(), userName: socket.userName, own: false};
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
    //There is no socket available. Therefore the user cannot be authenticated.
    if (socket === undefined) {
        return false;
    }
    if (socket.userName !== undefined) {
        return true;
    }
}

/*
 * Returns the Timestamp.
 * If onlyTime is true, this method returns only the current time.
 */
function getTimestamp(onlyTime) {
    var now = new Date(Date.now());
    if (onlyTime) {
        return now.toLocaleTimeString(LOCALE);  
    } else {
        return now.toLocaleDateString(LOCALE) + " " + now.toLocaleTimeString(LOCALE);
    }
}

server.listen(appEnv.port || config.port, function () {
    console.log('##### listening on  ' + appEnv.url);
});
