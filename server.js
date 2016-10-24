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

var birds = require('./routs');

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

//app.use('/', birds);

/*
 * Include static files like css/js via middleware.
 */
app.use(express.static(__dirname + '/public'));

/*
 * Route Handler -> 
 */
app.get('/', function(req, res) {
    console.log(config.filePath);
    res.sendFile(__dirname + '/public/index.html');
});

/*
 * Defines a moderate "REST"-Interface.
 * Allows to download a file if the file is available.
 */
app.get('/' + config.filePath + ':filename(*)', function(req, res) {
    var file = req.params.filename;
    var path = __dirname + "/" + config.filePath + file;

    res.download(path);
});

io.on('connection', function(socket) {
    
    if (socket.userName === undefined) {
        
    } else {
        
    }
    
    /*
     * Handle chat message.
     */
    socket.on('chat message', function(msg) {
        var data = {userName: socket.userName, message: msg, timeStamp: getCurrentDate(), own: false};
        socket.broadcast.emit('chat message', data); //Broadcast message to all users except me.
        data.own = true;
        socket.emit('chat message', data); //Send message only to me
        
    });
    
    /*
     * Handle user join.
     */
    socket.on('user join', function(userName, isJoinedFunc) {
        isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
        socket.userName = userName; //Assign username to socket so you can use it later
        connectedUsers.push(userName);
        userMap.set(socket.userName,socket);
        io.emit('user join leave', {userName: userName, timeStamp: getCurrentDate(), isJoined: true});
    });
    
    socket.on('disconnect', function() {
        io.emit('user join leave', {userName: socket.userName, timeStamp: getCurrentDate(), isJoined: false});
        var pos = connectedUsers.indexOf(socket.userName);
        connectedUsers.splice(pos,1);
    });
    
    /*
    * Handle request of current users
    */
    socket.on('user list', function () {
        socket.emit('user list', {users: connectedUsers, timeStamp: getCurrentDate()}); //Send message to me (allows to define different styles)
    });
    
    ss(socket).on('file', function(stream, data) {
        var filename = config.filePath + path.basename(data.fileName);
        //Neither "finish", "close" NOR "end" callbacks are working -> BUG
        //We have to emit the Link data althought the data upload is not finished. 
        stream.pipe(fs.createWriteStream(filename));
        var newData = {filePath: config.filePath, fileName: data.fileName, timeStamp: getCurrentDate(), userName: socket.userName, own: false};
        socket.broadcast.emit('file', newData);
        newData.own = true;
        socket.emit('file', newData);
    });
    
});

/*
 * Returns the current Time in the format HH:MM:SS
 */
function getCurrentDate() {
    var now = new Date(Date.now());
    return now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
}
