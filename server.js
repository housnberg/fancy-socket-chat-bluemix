const LOCALE = "de-DE";
const HOURS_IN_MILISECONDS = 3600000; //Yes, this value is supported in javascript

/*
 * ALlows to stream binary data.
 */
var fs = require("fs");
var ss = require('socket.io-stream');
var path = require('path');
var bodyParser = require('body-parser');
var helper = require('./helper.js');

var express = require('express');
var helmet = require('helmet');
var	app = express();

//var redis = require("redis"),
//var redisClient = redis.createClient(); //Allows

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

//var pkg = require("./package.json");

//console.log('#####' + appEnv.app.instance_id);
//console.log('#####' + appEnv.instance_id);

// Load the Cloudant library.
var Cloudant = require('cloudant');
// Load the Watson Visual recognition library
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');

var weatherUrl;
var supportedWeatherLocations;

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

//Query to find a specific key by id
var keySelector = {
    "selector": {
        "isMasterKey": true
    }  
};

init();

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        fontSrc: ["'self'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        connectSrc: ["'self'", "ws://" + appEnv.url.replace('https://', '')]
    },
    browserSniff: false,
    setAllHeaders: true
}));
app.use(helmet.hsts({
  maxAge: 604800,
  force: true,
    preload: true,
    fore: true
}))
app.use(helmet.referrerPolicy({ 
    policy: 'same-origin' 
}));
app.use(helmet.xssFilter());
app.enable('trust proxy');
app.use(bodyParser.json()); // for parsing application/json
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
        if (helper.isServiceAvailable(cloudant)) {
            userSelector.selector._id = data.userName.toLocaleLowerCase();
            
            database.find(userSelector, function(error, resultSet) {
                if (error) {
                    console.log("ERROR: Something went wrong during query procession: " + error);
                } else {
                    if (resultSet.docs.length == 0) {
                        
                        var salt = helper.generateSalt();
                        var hashedPassword = helper.hashPassword(data.password, salt);
                        
                        //Call the visual recognition service only if the user has uploaded an avatar image.
                        if (data.hasUploadedAvatar) {
                            var fileName = 'avatar_' + data.userName.toLocaleLowerCase();
                            var filePath = './public/image/';
                            var ext = helper.base64ImageToFile(data.avatar, filePath, fileName);
                            var urlSuffix = '/image/' + fileName + '.' + ext;
                            
                            var params = {
                                //images_file: fs.createReadStream('./public/image/avatar_test.' + ext) //Doesn work for some reason
                                url: (appEnv.url + urlSuffix)
                            };

                            visualRecognition.detectFaces(params, function(err, result) {
                                if (err) {
                                    isRegisteredFunc(false, true);
                                    console.log(err);   
                                } else {

                                    var hasMatch = false;
                                    for (var i = 0; i < result.images.length; i++) {
                                        var image =  result.images[i];
                                        for (var j = 0; j < image.faces.length; j++) {
                                            var face = image.faces[j];
                                            var gender = face.gender.gender;
                                            if (gender === 'MALE' || gender === 'FEMALE') {
                                                hasMatch = true;    
                                            }
                                        }
                                    }

                                    if (hasMatch) {
                                        database.insert({_id: data.userName.toLocaleLowerCase(), password: hashedPassword, salt: salt, avatarPath: urlSuffix, hasAdminRights: false}, data.userName.toLocaleLowerCase(), function(error, body) {
                                            if (!error) {
                                                isRegisteredFunc(true);
                                            } else {
                                                console.log("ERROR: Could not store the values " + error);
                                            }
                                        });  
                                    } else {
                                         isRegisteredFunc(false, true);
                                    }  
                                }
                            });   
                        } else {
                            database.insert({_id: data.userName.toLocaleLowerCase(), password: hashedPassword, salt: salt, avatarPath: data.avatar}, data.userName.toLocaleLowerCase(), function(error, body) {
                                if (!error) {
                                    isRegisteredFunc(true);
                                } else {
                                    console.log("ERROR: Could not store the values " + error);
                                }
                            });  
                        }
                    } else {
                        isRegisteredFunc(false);
                    }   
                }
            });
        }
    });
    
    /*
     * Check if the user is authenticated (has a valid masterkey).
     */
    socket.on('authentication', function(masterKey, callback) {
        database.find(keySelector, function(error, resultSet) {
            if (error) {
                callback(false);
            } else {
                if (resultSet.docs.length == 0) {
                    callback(false);
                } else {
                    authenticated = false;
                    for (var i = 0; i < resultSet.docs.length; i++) {
                        var salt = resultSet.docs[i].salt;
                        if (resultSet.docs[i]._id === helper.hashPassword(masterKey, salt)) {
                            authenticated = true;
                            break;
                        }
                    }
                    callback(authenticated);
                }
            }
        });
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
           io.in(socket.room).emit('user join leave', {userName: socket.userName, timeStamp: helper.getTimestamp(LOCALE), isJoined: false});
           socket.room = roomData.roomName;
           socket.join(socket.room);
           io.in(socket.room).emit('user join leave', {userName: socket.userName, timeStamp: helper.getTimestamp(LOCALE), isJoined: true}); 
       } else {
           isJoinedFunc(false);
       }
    });
    
    /*
     * Handle user login.
     */
    socket.on('user join', function(data, isJoinedFunc) {
        
        if (helper.isServiceAvailable(cloudant)) {
            userSelector.selector._id = data.userName.toLocaleLowerCase();
        
            database.find(userSelector, function(error, resultSet) {
                if (error) {
                    console.log("ERROR: Something went wrong during query procession: " + error);
                } else {
                    if (resultSet.docs.length == 0) {
                        isJoinedFunc(false); //Username not correct
                    } else {
                        if (resultSet.docs[0].password === helper.hashPassword(data.password, resultSet.docs[0].salt)) {
                            if (resultSet.docs[0].hasAdminRights !== true) {
                                socket.emit("remove");
                            } 
                            isJoinedFunc(true); //Callback function allows you to determine on client side if the username is already assigned to an other user
                            socket.userName = data.userName; //Assign username to socket so you can use it later
                            connectedUsers.push(data.userName);
                            socket.avatarPath = resultSet.docs[0].avatarPath;
                            io.in(socket.room).emit('user join leave', {userName: data.userName, timeStamp: helper.getTimestamp(LOCALE), isJoined: true});   
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
                io.in(socket.room).emit('user join leave', {userName: data.userName, timeStamp: helper.getTimestamp(LOCALE), isJoined: true});   
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
            var timeStamp = helper.getTimestamp(LOCALE, true);
            var messageId = socket.userName + " " + timeStamp;
            var data = {userName: socket.userName, message: msg, timeStamp: timeStamp, own: false, avatar: socket.avatarPath, messageId: messageId};
            //Broadcast message to all users except me.
            checkSupportedWeatherLocations(msg, function(error, cities) {
                if (!error) {
                    emitMessage(socket, data);
                    for (var i = 0; i < cities.length; i++) {
                        helper.requestWeather(weatherUrl, cities[i], function(error, weatherData) {
                           if (!error) {
                               weatherData.messageId = messageId;
                               io.in(socket.room).emit('weather data', weatherData);   
                           } else {
                               console.log("the city doesnt exist");
                           }
                        });       
                    }
                } else {
                    emitMessage(socket, data);
                }
            });
        }
    });

    /*
     * Handle user disconnection.
     */
    socket.on('disconnect', function() {
        if (isAuthenticated(socket)) {
            var pos = connectedUsers.indexOf(socket.userName);
            connectedUsers.splice(pos, 1);
            io.in(socket.room).emit('user join leave', {userName: socket.userName, timeStamp: helper.getTimestamp(LOCALE), isJoined: false});
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
            socket.emit('user list', {users: connectedUsersPerRoom, timeStamp: helper.getTimestamp(LOCALE, true)}); //Send message to me (allows to define different styles)
        }
    });

    /*
     * Handle direct message submission.
     */
    socket.on('direct message', function (msg) {
        var userName = msg.substr(0, msg.indexOf(' ')).replace('@','');
        var message = msg.substr(msg.indexOf(' ') + 1);
        
        var tempSocket = userMap.get(userName);
        var data = {userName: socket.userName, message: message, timeStamp: helper.getTimestamp(LOCALE, true), own: false, direct: true, avatar: socket.avatarPath};
        
        //If socketName is undefined or null there is no user with this name available.
        //Don't allow the send a private message to yourself.
        if (tempSocket !== undefined && tempSocket != null && tempSocket != socket) {
            tempSocket.emit('chat message', data); //Broadcast message to direct user
            data.own = true;
            socket.emit('chat message', data); //Send message only to me   
        }
    });
    
    /*
     * Handle generation of masterkey.
     * Delete the generated masterkey if you include an expiration date.
     */
    socket.on('generate key', function(data, callback) {
        var ttl = parseInt(data.ttl);
        var unit = data.unit;
        userSelector.selector._id = socket.userName.toLocaleLowerCase();
        
        var factor = 1000;
        
        if (unit === "mins") {
            factor = factor * 60;   
        } else if (unit === "hrs") {
            factor = factor * 60 * 60;
        }
        
        database.find(userSelector, function(error, resultSet) {
            if (error) {
                
            } else {
                if (resultSet.docs[0].hasAdminRights === true) {
                    
                    var salt = helper.generateSalt();
                    var hashedPassword = helper.hashPassword(data.key, salt);
                    
                    database.insert({_id: hashedPassword, salt: salt, isMasterKey: true}, function(error, body) {
                        if (!error) {
                            var rev = body.rev;
                            if (!isNaN(ttl)) {
                                var timeOut = setTimeout(function(masterKey, rev) {
                                    database.destroy(masterKey, rev, function(err, body) {
                                        if (err) {
                                            console.log("ERROR: " + err);
                                        }
                                    });
                                    clearTimeout(this);
                                }, ttl * factor, hashedPassword, rev);
                            }
                            callback(false);
                        } else {
                            callback(true);
                        }
                    });  
                } else {
                    //Callback no admin rights;
                }
            }
        });
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
            var newData = {filePath: config.filePath, fileName: data.fileName, timeStamp: helper.getTimestamp(LOCALE), userName: socket.userName, own: false, avatar: socket.avatarPath};
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
        
        //Search for available cloudant services.
        var cloudantService = services['cloudantNoSQLDB'];
        for (var service in cloudantService) {
            if (cloudantService[service].name === 'cloudant-nosql-db') {
                cloudant = Cloudant(cloudantService[service].credentials.url);
            }
        }
        
        //Search for available visual recognition services.
        var visualRecognitionService = services['watson_vision_combined'];
        for (var service in visualRecognitionService) {
            if (visualRecognitionService[service].name === 'visual-recognition') {
                visualRecognition = new VisualRecognitionV3({
                    api_key: visualRecognitionService[service].credentials.api_key,
                    version_date: '2016-05-20'
                });
            }
        }
        
        //Search for available weather data services.
        var weatherCompanyService = services['weatherinsights'];
        for (var service in weatherCompanyService) {
            if (weatherCompanyService[service].name === 'Weather Company Data-fw') {
                weatherUrl = weatherCompanyService[service].credentials.url;
                console.log(weatherUrl);
            }
        }
    } else {
        console.log("ERROR: Cloudant Service was not bound! Are you running in local mode?");
    }

    if (helper.isServiceAvailable(cloudant)) {
        database = cloudant.db.use('fancy-socket-chat');
        if (database === undefined) {
            console.log("ERROR: The database with the name 'fancy-socket-chat' is not defined. You have to define it before you can use the database.")
        } else {
            var weatherSelector = {
                "selector": {
                    "_id": "supportedWeatherLocations"
                }  
            };
            database.find(weatherSelector, function(error, resultSet) {
                if (!error) {
                    supportedWeatherLocations = resultSet.docs[0].cities;
                }
            }); 
            setInterval(function() { 
                database.find(weatherSelector, function(error, resultSet) {
                    if (!error) {
                        supportedWeatherLocations = resultSet.docs[0].cities;
                    }
                }); 
            }, HOURS_IN_MILISECONDS); //Update the supported weather locations every hour
        }
    }
    
    
}

server.listen(appEnv.port || config.port, function () {
    console.log('##### Listening on  ' + appEnv.url);
});


/*
 * Emit chat message data.
 */
function emitMessage(socket, data) {
    socket.broadcast.to(socket.room).emit('chat message', data);
    data.own = true;
    //Send message only to me   
    socket.emit('chat message', data);    
}

/*
 * Check if the message string contains locations which are supported to fetch weather data.
 * Return all cities which are available in the message.
 */
function checkSupportedWeatherLocations(message, callback) {
    console.log("SUPPORTED WEATHER:" + supportedWeatherLocations);
    var availableLocations = new Array();
    for (var i = 0; i < supportedWeatherLocations.length; i++) {
        var index = message.toLocaleLowerCase().indexOf(supportedWeatherLocations[i].toLocaleLowerCase());
        if (index != -1) {
            availableLocations.push(supportedWeatherLocations[i]);
        }   
    }
    if (availableLocations.length == 0) {
        callback(true);   
    } else {
        callback(false, availableLocations, index);
    }
} 
