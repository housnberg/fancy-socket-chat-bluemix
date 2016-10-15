/*
 * Import of the express module.
 */
var express = require('express');
var	app = express();
var	server = require('http').createServer(app);
var	io = require('socket.io').listen(server);

var birds = require('./routs');

/*
 * Array for all connected users.
 */
var connectedUsers;

/*
 * Load Server Config file.
 */
var config = require('./config.json');

server.listen(config.port, function() {
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
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', function(socket) {
    
    if (socket.userName === undefined) {
        
    } else {
        
    }
    
    socket.on('disconnect', function() {
        io.emit('user left', {userName: socket.userName, timeStamp: getCurrentDate()});
    });
    
    /*
     * Handle chat message.
     */
    socket.on('chat message', function(msg) {
        var data = {userName: socket.userName, message: msg, timeStamp: getCurrentDate()};
        socket.broadcast.emit('chat message', data); //Broadcast message to all
        socket.emit('chat message own', data); //Send message to me (allows to define different styles)
    });
    
    /*
     * Handle user join.
     * Save the username later in n array.
     */
    socket.on('user join', function(userName, isJoinedFunc) {
        isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
        socket.userName = userName; //Assign username to socket so you can use it later
        io.emit('user join', {userName: userName, timeStamp: getCurrentDate()});
    });
});

/*
 * Returns the current Time in the format HH:MM:SS
 */
function getCurrentDate() {
    var now = new Date(Date.now());
    return now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
}
