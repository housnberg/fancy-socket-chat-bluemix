/*
 * Import of the express module
 */
var express = require('express');
var	app = express();
var	server = require('http').createServer(app);
var	io = require('socket.io').listen(server);

/*
 * Load config json file
 */
var config = require('./config.json');

server.listen(config.port, function() {
    console.log('##### listening on  port ' + config.port);
});

/*
 * Include static files like css/js via middleware
 */
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', function(socket) {
    console.log('a user connected');
    socket.on('disconnect', function() {
        console.log('user disconnected');
    });
});