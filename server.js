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

var services;
var credentials;
var cloudant;
var database;

var userSelector = {
    "selector": {
        "_id": ""
    }  
};

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
    cloudant = Cloudant(credentials.url);
} else {
	console.log("ERROR: Cloudant Service was not bound! Are you running in local mode?");
}

if (isServiceAvailable(cloudant)) {
    database = cloudant.db.use('fancy-socket-chat');
    if (database === undefined) {
        console.log("ERROR: The database with the name 'fancy-socket-chat' is not defined. You have to define it before you can use the database.")
    } else {
        /*
        database.insert({_id: 'hans', password: 'wurst' }, function(err, body) {
            if (!err) {
                console.log(body)
            } else {
                console.log("ERROR: Could not store the values " + err);
            }
        });

        database.list(function(err, body) {
            if (!err) {
                body.rows.forEach(function(doc) {
                    console.log(doc);
                });
            } else {
                console.log("ERROR: Could not read the docs.");
            }
        });
        */
        /*
        database.index(function(er, result) {
            if (er) {
                throw er;
            }

            console.log('The database has %d indexes', result.indexes.length);
            for (var i = 0; i < result.indexes.length; i++) {
                console.log('  %s (%s): %j', result.indexes[i].name, result.indexes[i].type, result.indexes[i].def);
            }

            result.should.have.a.property('indexes').which.is.an.Array;
            done();
        });
        */
    }

    cloudant.db.list(function(err, allDbs) {
      console.log('All my databases: %s', allDbs.join(', '))
    });
}

app.use('/', router);

io.on('connection', function(socket) {
    
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
                        database.insert({_id: data.userName.toLocaleLowerCase(), password: data.password}, function(error, body) {
                            if (!error) {
                                isRegisteredFunc(true);
                            } else {
                                console.log("ERROR: Could not store the values " + error);
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
                            io.emit('user join leave', {userName: data.userName, timeStamp: getTimestamp(), isJoined: true});   
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
                io.emit('user join leave', {userName: data.userName, timeStamp: getTimestamp(), isJoined: true});   
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
 * Check if a given bluemix service is available.
 */
function isServiceAvailable(bluemixService) {
    return (bluemixService !== null && bluemixService !== undefined);
}

function processQuery(selector) {
    var resultSet = null;
    if  (isServiceAvailable(cloudant) && selector !== undefined && selector !== null) {
        database.find(selector, function(error, result) {
            if (error) {
                console.log("ERROR: Something went wrong during query procession: " + error);
            } else {
                resultSet = result;
            }
            //console.log(resultSet.docs[0])
        });          
    }
    console.log(resultSet.docs[0]);
    return resultSet;
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
