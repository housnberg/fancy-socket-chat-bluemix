var LOCALE = 'de-DE';

/*
 * ALlows to stream binary data.
 */
var fs = require("fs");
var ss = require('socket.io-stream');
var path = require('path');

/*
 * Import of the express module.
 */
var express = require('express');
var	app = express();

/*
 * options for https-conection
 */
const conf = {
    key : fs.readFileSync('schluessel.key'),
    cert : fs.readFileSync('zertifikat.pem'),
    passphrase: 'fancychat'
};

//var server = require('https').createServer(conf, app); //Use this if you want to run an secured Application in local mode
var server = require('http').createServer(app);
var	io = require('socket.io').listen(server);

var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();

// Load the Cloudant library.
var Cloudant = require('cloudant');
// Load the Watson Visual recognition library
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');

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
var roomPasswords = new Map();

var rooms = new Array();
rooms.push("Global");

/*
 * Load Server Config file.
 */
var config = require('./config.json');

var services;
var cloudant;
var visualRecognition;
var database;

//Query to find a specific user by id
var userSelector = {
    "selector": {
        "_id": ""
    }  
};

init();

app.enable('trust proxy');
app.use('/', router);

io.on('connection', function(socket) {
    
    //A connected user is always in the "global" room
    socket.room = rooms[0];
    socket.join(socket.room);
    //Never ever create rooms statically in the html page.
    //This allows to create the "global" room dynamically.
    socket.emit('create room', {roomName: rooms[0], hasPassword: false});
    for (var i = 1; i < rooms.length; i++) {
        socket.emit('create room', {roomName: rooms[i]});
    }
    
    /*
     * Handle user registration.
     */
    socket.on('user registration', function(data, isRegisteredFunc) {
        if (isServiceAvailable(cloudant)) {
            userSelector.selector._id = data.userName.toLocaleLowerCase();
        
            database.find(userSelector, function(error, resultSet) {
                if (error) {
                    console.log("ERROR: Something went wrong during query procession: " + error);
                } else {
                    if (resultSet.docs.length == 0) {
                        var fileName = 'avatar_' + data.userName.toLocaleLowerCase();
                        var filePath = './public/image/';
                        var ext = base64ImageToFile(data.avatar, filePath, fileName);
                        var urlSuffix = '/image/' + fileName + '.' + ext;
                        
                        var params = {
                            //images_file: fs.createReadStream('./public/image/avatar_test.' + ext) //Doesn work for some reason
                            url: (appEnv.url + urlSuffix)
                        };
                        
                        visualRecognition.detectFaces(params, function(err, res) {
                            if (err) {
                                isRegisteredFunc(false, true);
                                console.log(err);   
                            } else {
                                if (false == true) {
                                    
                                } else {
                                    database.insert({_id: data.userName.toLocaleLowerCase(), password: data.password, avatarPath: urlSuffix}, function(error, body) {
                                    if (!error) {
                                        isRegisteredFunc(true);
                                    } else {
                                        console.log("ERROR: Could not store the values " + error);
                                    }
                                });  
                                    console.log(JSON.stringify(res, null, 2));     
                                }  
                            }
                        });
                    } else {
                        isRegisteredFunc(false);
                    }   
                }
            });
        }
    });
    
    /*
     * Handle room creation
     */
    socket.on('create room', function(roomData, isRoomCreatedFunc) {
        if (rooms.indexOf(roomData.roomName) == -1) {
            isRoomCreatedFunc(true);
            rooms.push(roomData.roomName);
            roomPasswords.set(roomData.roomName, roomData.roomPassword);
            io.emit('create room', {roomName: roomData.roomName});   
        } else {
            isRoomCreatedFunc(false);
        } 
    });
    
    /*
     * Handle user join room.
     */
    socket.on('join room', function(roomData, isJoinedFunc) {
       if (roomPasswords.get(roomData.roomName) === roomData.roomPassword || roomData.roomPassword === undefined) {
           isJoinedFunc(true);
           socket.leave(socket.room);
           io.in(socket.room).emit('user join leave', {userName: socket.userName, timeStamp: getTimestamp(), isJoined: false});
           socket.room = roomData.roomName;
           socket.join(socket.room);
           io.in(socket.room).emit('user join leave', {userName: socket.userName, timeStamp: getTimestamp(), isJoined: true}); 
       } else {
           isJoinedFunc(false);
       }
    });
    
    /*
     * Handle user login.
     */
    socket.on('user join', function(data, isJoinedFunc) {
        
        if (isServiceAvailable(cloudant)) {
            userSelector.selector._id = data.userName.toLocaleLowerCase();
        
            database.find(userSelector, function(error, resultSet) {
                if (error) {
                    console.log("ERROR: Something went wrong during query procession: " + error);
                } else {
                    if (resultSet.docs.length == 0) {
                        isJoinedFunc(false); //Username not correct
                    } else {
                        if (resultSet.docs[0].password === data.password) {
                            isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
                            socket.userName = data.userName; //Assign username to socket so you can use it later
                            connectedUsers.push(data.userName);
                            socket.avatarPath = resultSet.docs[0].avatarPath;
                            io.in(socket.room).emit('user join leave', {userName: data.userName, timeStamp: getTimestamp(), isJoined: true});   
                            userMap.set(socket.userName, socket);
                        } else {
                            isJoinedFunc(false); //Password not correct
                        }
                    }   
                }
            });
        } else {
            //You dont really need this else part. But it allows you to run the application in local code
            if (connectedUsers.indexOf(data.userName) == -1) {
                isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
                socket.userName = data.userName; //Assign username to socket so you can use it later
                connectedUsers.push(data.userName);
                io.in(socket.room).emit('user join leave', {userName: data.userName, timeStamp: getTimestamp(), isJoined: true});   
                userMap.set(socket.userName, socket);
            } else {
                //Indicate that the username is already taken.
                isJoinedFunc(false);
            }   
        }
    });
    
    /*
    * Handle chat message submisson.
    */
    socket.on('chat message', function(msg) {
        if (isAuthenticated(socket)) {
            var data = {userName: socket.userName, message: msg, timeStamp: getTimestamp(true), own: false, avatar: socket.avatarPath};
            //Broadcast message to all users except me.
            socket.broadcast.to(socket.room).emit('chat message', data);
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
            io.in(socket.room).emit('user join leave', {userName: socket.userName, timeStamp: getTimestamp(), isJoined: false});
        }
    });

    /*
     * Handle request of a list of all current users.
     */
    socket.on('user list', function () {
        if (isAuthenticated(socket)) {
            var connectedUsersPerRoom = new Array();
            //Only send the connected users per room
            for (var i = 0; i < connectedUsers.length; i++) {
                if (socket.room === userMap.get(connectedUsers[i]).room) {
                    connectedUsersPerRoom.push(connectedUsers[i]);
                }
            }
            socket.emit('user list', {users: connectedUsersPerRoom, timeStamp: getTimestamp(true)}); //Send message to me (allows to define different styles)
        }
    });

    /*
     * Handle direct message submission.
     */
    socket.on('direct message', function (msg) {
        var userName = msg.substr(0, msg.indexOf(' ')).replace('@','');
        var message = msg.substr(msg.indexOf(' ') + 1);
        
        var tempSocket = userMap.get(userName);
        var data = {userName: socket.userName, message: message, timeStamp: getTimestamp(true), own: false, direct: true, avatar: socket.avatarPath};
        
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
            var newData = {filePath: config.filePath, fileName: data.fileName, timeStamp: getTimestamp(), userName: socket.userName, own: false, avatar: socket.avatarPath};
            socket.broadcast.to(socket.room).emit('file', newData);
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
 * Initialize the application to run on bluemix.
 */
function init() {
    /*
     * Search for the cloudant service.
     */
    if (process.env.VCAP_SERVICES) {
        services = JSON.parse(process.env.VCAP_SERVICES);

        var cloudantService = services['cloudantNoSQLDB'];
        for (var service in cloudantService) {
            if (cloudantService[service].name === 'cloudant-nosql-db') {
                cloudant = Cloudant(cloudantService[service].credentials.url);
            }
        }
        
        var visualRecognitionService = services['watson_vision_combined'];
        for (var service in visualRecognitionService) {
            if (visualRecognitionService[service].name === 'visual-recognition') {
                visualRecognition = new VisualRecognitionV3({
                    api_key: visualRecognitionService[service].credentials.api_key,
                    version_date: '2016-05-20'
                });
            }
        }
    } else {
        console.log("ERROR: Cloudant Service was not bound! Are you running in local mode?");
    }

    if (isServiceAvailable(cloudant)) {
        database = cloudant.db.use('fancy-socket-chat');
        if (database === undefined) {
            console.log("ERROR: The database with the name 'fancy-socket-chat' is not defined. You have to define it before you can use the database.")
        }
    }
}

/*
 * Check if a given bluemix service is available.
 */
function isServiceAvailable(bluemixService) {
    return (bluemixService !== null && bluemixService !== undefined);
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

var img = "data:image/png;base64,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";

// Grab the extension to resolve any image error
function base64ImageToFile(base64image, directory, filename) {
    var ext = base64image.split(';')[0].match(/jpeg|png|gif|jpg/)[0];
    // strip off the data: url prefix to get just the base64-encoded bytes
    var data = base64image.replace(/^data:image\/\w+;base64,/, "");
    var buf = new Buffer(data, 'base64');
    fs.writeFile(directory + filename + '.' + ext, buf);
    
    return ext;
}

server.listen(appEnv.port || config.port, function () {
    console.log('##### Listening on  ' + appEnv.url);
});
