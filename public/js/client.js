var file;
var avatarAsBase64;

//Regex from: http://www.the-art-of-web.com/javascript/validate-password/
var passwordRegex = /(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,}/;
var passwordInvalidMessage = 'The password should contain at least one number, one lowercase, one uppercase letter and at least six characters';
var roomNameMinLength = 3;
var roomNameMaxLength = 20;

var io = require('socket.io-client');
var ss = require('socket.io-stream');
var helper = require('./helper.js');

var socket = io.connect();

ss.forceBase64 = true;

/*
 * Wait until the DOM is ready so all HTML-Elements are loaded.
 */
$(document).ready(function() {
    
    /*
     * Submit message and/or file.
     */
    $('#chat-wrapper footer form').submit(function() {
        var $message = $.trim($('#message').val());
         
        if ($message) {
            if($message === '/users') { //if the message is /users call function to send out the list of current users
                socket.emit('user list');
            } else if ($message.startsWith('/weather')) {
                 socket.emit('weather', $message); 
            }else if ($message.startsWith('/generatekey')) {
                var splittedMessage = $message.split(" ");
                if (splittedMessage[1] !== undefined && splittedMessage[1] != null) {
                    var key = splittedMessage[1];
                    if (passwordRegex.test(key)) {
                        socket.emit('generate key', key); 
                    }
                }
            } else if($message.startsWith('@')) {
                if ($message.split(" ")[1] !== undefined && $message.split(" ")[1] != null) {
                    socket.emit('direct message', $message);   
                }
            } else {
                socket.emit('chat message', $message);
            }
            $('#message').val('');
        }
        $().uploadFile();
        return false;
    });
    
    /*
     * File change listener.
     * Listen if somone selects a file via the filemanager.
     * This function is not called if the user hits "cancel".
     */
    $('#file').change(function(e) {
        file = e.target.files[0];
        $('footer > button#button-file > i').css('color', '#FD5F5E');
    });
    
    $('#file-avatar').change(function(e) {
        window.alert('yeag');
        file = e.target.files[0];
        helper.readURL(file, $('img'), 275, 275, 50, function(hallo) {
            var $validationMessage = $loginDialog.find('.validation-message');
            if (hallo) {
                $validationMessage.text("");
            } else {
                $validationMessage.text("The file is either too large (max 50kb) or too big (width/height max 275px).");
            }
        });
        file = undefined;
    });
    
    /*
     * Create and initialize the create picture dialog.
     */ 
    var $takePictureDialog = $('#take-picture-dialog').dialog({
        autoOpen: false,
        height: 'auto',
        width: 'auto',
        modal: true,
        show: 'blind',
        hide: 'blind',
        draggable: false,
        resizable: false,
        buttons: {
            "Snap": function() {
                helper.takePicture($('#canvas'), $('#video'))
            },
            "Save": function() {
                var image = helper.convertCanvasToImage($('#canvas'));
                $('img').attr('src', image.src);
                $takePictureDialog.dialog('close');
            },
            Cancel: function() {
                $takePictureDialog.dialog('close');
            }
        },
        open: function() {
            helper.startWebcamVideo($('#video'));
        },
        close: function() {
            helper.stopWebcamVideo($('#video'));
        }
    });
    
    
    
    /*
     * Create and initialize the login dialog.
     */ 
    var $loginDialog = $('#login-dialog').dialog({
        autoOpen: true,
        height: 'auto',
        width: 'auto',
        modal: true,
        show: 'blind',
        hide: 'blind',
        draggable: false,
        resizable: false,
        classes: {
            "ui-dialog": "ui-dialog ui-dialog-full"
        },
        buttons: {
            "Login": function() {
                $loginForm.submit();
            },
            "Register": function() {
                $loginForm.submit();
            }
        },
        close: function() {
            $loginForm[0].reset();
        }
    });
    
    /*
     * Handle submission of login data.
     */
    var $loginForm = $loginDialog.find('form').on('submit', function() {
        var clickedButtonName = $('.ui-button:focus').text();
        var $usernameField = $('#username');
        var username = $.trim($usernameField.val());
        var $passwordField = $('#password'); //Its allowed to use whitespaces in the password
        var password = $passwordField.val(); 
        var $avatar = $('img');
        var avatarAsBase64 = $avatar.attr('src');
        var $validationMessage = $loginDialog.find('.validation-message');
        var $successMessage = $loginDialog.find('.success-message');
        var $masterKeyField = $('#masterkey');
        var masterKey = $.trim($masterKeyField.val()); //Remove whitespaces
        var $allFields = $([]).add($usernameField).add($passwordField).add($masterKeyField);
        
        helper.clearValidationMessage($validationMessage, $allFields);
        $successMessage.empty();
        var data = {userName: username, password: password}; //Hash the password 
        if (username && password) {
            //Determine if the "register" oder the "login" submit button was clicked
            
            if (clickedButtonName === "Register") {
                socket.emit('authentication', masterKey, function(isAuthenticated) {
                    if (isAuthenticated) {
                        if (passwordRegex.test(password)) {
                            if (avatarAsBase64.indexOf('base64') != -1) {
                                data.hasUploadedAvatar = true;
                            }
                            data.avatar = avatarAsBase64;
                            $successMessage.text('Processing the registration ...');

                            socket.emit('user registration', data, function(isRegistered, faceDoesntMatch) {
                                $successMessage.text('');
                                if (isRegistered) {
                                    $successMessage.text('The registration was successfull! You can now login with your data.');
                                } else {
                                    if (faceDoesntMatch) {
                                        helper.addValidationMessage('Either the quality is poor or this is not a face.', $validationMessage);   
                                    } else {
                                        helper.addValidationMessage('The user with the username "' + username + '" already exists.', $validationMessage);
                                    }
                                }
                            });   
                        } else {
                            helper.addValidationMessage(passwordInvalidMessage, $validationMessage);
                        }    
                   } else {
                       helper.addValidationMessage("The masterkey doesnt exist.", $validationMessage, $masterKeyField);
                   }
                });
            } else {
                socket.emit('user join', data, function(isJoined) {
                    if (isJoined) {
                        $loginDialog.dialog('close');
                    } else {
                        helper.addValidationMessage('The user with the username "' + username + '" does not exist or the password is wrong.', $validationMessage);
                    }
                });    
            }
            $loginForm[0].reset();
        } else if (password) {
            helper.addValidationMessage('Please specify a username.', $validationMessage, $usernameField);
        } else if (username) {
            helper.addValidationMessage('Please specify a password.', $validationMessage, $passwordField);
        } else {
            helper.addValidationMessage('Pleayse specify a username and a password.', $validationMessage, $allFields);
        }
        //Stop browser navigating from page
        //You could also use event.preventDefault() instead returning false
        return false;
    });
    
    /* 
     * Create and initialize Join room dialog via JQuery UI.
     */
    var $joinRoomDialog = $('#dialog-form').dialog({
        autoOpen: false,
        height: 'auto',
        width: 'auto',
        modal: true,
        show: 'blind',
        hide: 'blind',
        resizable: false,
        buttons: {
            "Join room": function() {
                $joinRoomForm.submit();
            },
            Cancel: function() {
                $joinRoomDialog.dialog('close');
            }
        },
        close: function() {
            $joinRoomForm[0].reset();
        }
    });
    
    /* 
     * Handle submission of join room form.
     */
    var $joinRoomForm = $joinRoomDialog.find('form').on('submit', function() {
        var $passwordField = $joinRoomForm.find('#password');
        var roomPassword = $passwordField.val(); //Its allowed to use whitespaces in the password
        var $validationMessage = $joinRoomDialog.find('.validation-message');
        var $roomToJoinHiddenField = $joinRoomDialog.find('#room-to-join');
        var roomToJoin = $roomToJoinHiddenField.val();
        var $hasPasswordHiddenField = $joinRoomDialog.find('#has-password');
        var hasPassword = $hasPasswordHiddenField.val();
        helper.clearValidationMessage($validationMessage, $passwordField);
        if (roomPassword || hasPassword === 'false') {
            var roomData = {roomName: roomToJoin, roomPassword: roomPassword};
            if (hasPassword === "false") {
                roomData.roomPassword = undefined; 
            }
            socket.emit('join room', roomData, function(isJoined) {
                if (isJoined) {
                    $('#messages').empty();
                    $('#rooms .room.current').toggleClass('current');
                    $('#rooms .room#' + roomToJoin).toggleClass('current');
                    $joinRoomDialog.dialog('close');
                } else {
                    helper.addValidationMessage('The password is not correct.', $validationMessage, $passwordField);
                }
            });
        } else {
            helper.addValidationMessage('Please specify a password.', $validationMessage, $passwordField);
        }
        $joinRoomForm[0].reset();
        return false;
    });
    
    /* 
     * Create and initialize Create room dialog via JQuery UI.
     */
    var $createRoomDialog = $('#dialog-create-room').dialog({
        autoOpen: false,
        height: 'auto',
        width: 'auto',
        modal: true,
        show: 'blind',
        hide: 'blind',
        resizable: false,
        buttons: {
            "Create room": function() {
                $createRoomForm.submit();
            },
            Cancel: function() {
                $createRoomDialog.dialog('close');
            }
        },
        close: function() {
            $createRoomForm[0].reset();
        }
    });
    
    /* 
     * Handle submission of create room form.
     */
    var $createRoomForm = $createRoomDialog.find('form').on('submit', function() {
        var $roomNameField = $('#room-name');
        var roomName = $.trim($roomNameField.val());
        var $roomPasswordField = $('#room-password');
        var roomPassword = $roomPasswordField.val(); //Its allowed to use whitespaces in the password
        
        var $allFields = $([]).add($roomNameField).add($roomPasswordField);
        var $validationMessage = $createRoomDialog.find('.validation-message');
        helper.clearValidationMessage($validationMessage, $allFields);
        if (roomName && roomPassword) {
            if (roomName.length < roomNameMinLength || roomName.length > roomNameMaxLength) {
                helper.addValidationMessage('The length of the roomname must lay between 3 und 20 chars.', $validationMessage, $roomNameField);
            } else if (passwordRegex.test(roomPassword)) {
                socket.emit('create room', {roomName: roomName, roomPassword: roomPassword}, function(isRoomCreated) {
                    if (isRoomCreated) {
                        $createRoomDialog.dialog('close');    
                    } else {
                        helper.addValidationMessage("There is already a room with the name " + roomName, $validationMessage, $roomNameField);
                    }
                });
            } else {
                helper.addValidationMessage(passwordInvalidMessage, $validationMessage);
            }
        } else if (roomName) {
            helper.addValidationMessage('Please specify a password.', $validationMessage, $roomPasswordField);
        } else if (roomPassword) {
            helper.addValidationMessage('Please specify a room name.', $validationMessage, $roomNameField);
        } else {
            helper.addValidationMessage('Please specify a room name and a password.', $validationMessage, $allFields);
        }
        $createRoomForm[0].reset();
        return false;
    });
    
    /* 
     * Create and initialize Create room dialog via JQuery UI.
     */
    var $manageKeysDialog = $('#dialog-manage-keys').dialog({
        autoOpen: false,
        height: 'auto',
        width: 'auto',
        modal: true,
        show: 'blind',
        hide: 'blind',
        resizable: false,
        buttons: {
            "Create key": function() {
                $manageKeysForm.submit();
            },
            Cancel: function() {
                $manageKeysDialog.dialog('close');
            }
        },
        close: function() {
            $manageKeysForm[0].reset();
        }
    });
    
    /* 
     * Handle submission of create room form.
     */
    var $manageKeysForm = $manageKeysDialog.find('form').on('submit', function() {
        var $keyField = $('#key');
        var key = $.trim($keyField.val());
        var $ttlField = $("#ttl");
        var ttl = $ttlField.val();
        var selectedUnit = $('#unit option:selected').text();
            
        var $allFields = $([]).add($keyField);
        var $validationMessage = $manageKeysDialog.find('.validation-message');
        helper.clearValidationMessage($validationMessage, $allFields);
        if (key) {
            if (passwordRegex.test(key)) {
                socket.emit('generate key', {key: key, ttl: ttl, unit: selectedUnit}, function(keyAlreadyAvailable) {
                    if (keyAlreadyAvailable) {
                        helper.addValidationMessage("This key is already set.", $validationMessage, $keyField);
                    } else {
                        $manageKeysDialog.dialog('close');    
                    }
                });
            } else {
                helper.addValidationMessage(passwordInvalidMessage, $validationMessage, $keyField);
            }
        } 
        $manageKeysForm[0].reset();
        return false;
    });
    
    $('#unit').selectmenu();
    
    /*
     * OnClick handler for room creation.
     */
    $('#create').on('click', function() {
        $createRoomDialog.dialog('open');
    });
    
    /*
     * OnClick handler for room creation.
     */
    $('#generate-keys').on('click', function() {
        $manageKeysDialog.dialog('open');
    });
    
    $('#take-picture').on('click', function() {
        $takePictureDialog.dialog('open');
    });
    
    /*
     * Displays the newly created rooms in a sidebar.
     * Add a click handler to the last created room. You can then enter a password.
     */ 
    socket.on('create room', function(roomData) {
        $('#rooms').append($('<li class="room" id="' + roomData.roomName + '">').text(roomData.roomName)); 
        //Assign a click handler the the newly created room
        var $lastCreatedRoom = $('#rooms .room:last-child');
        var $firstCreatedRoom = $('#rooms .room:first-child');
        if ($lastCreatedRoom.text() === $firstCreatedRoom.text()) {
            $firstCreatedRoom.toggleClass('current');
        }
        $lastCreatedRoom.on('click', function() {
            var roomToJoin = $(this).text();
            if (roomToJoin !== $('#rooms .room.current').text()) {
                $joinRoomDialog.find('#room-to-join').val(roomToJoin);
                $joinRoomDialog.find('#has-password').val(roomData.hasPassword);
                if (roomData.hasPassword == false) {
                    $joinRoomForm.submit();   
                } else {
                    $joinRoomDialog.dialog({title: roomData.roomName}).dialog('open');   
                }
            }
        });   
        
    });
    
    /*
     * Fill a own-message-box with the current users
     */
    socket.on('user list', function(data) {
        var $users = $('<li class="users">').text('All active users').append($('<span>').text(data.timeStamp));
        for (var i = 0; i < data.users.length; i++) {
            $users = $users.append($('<div>').text(data.users[i]));
        }
        $('#messages').append($users);
    });

    /*
     * Show the received message in the browser.
     * There are two types of chat messages. Default, own and direct.
     * It allows to style these messages independent of each other.
     */
    socket.on('chat message', function(data) {
        var chatClass = "message-wrapper";
        if (data.own) {
            chatClass += " own";
        } 
        if (data.direct) {
            chatClass += " direct";
        }
        $('#messages').append($('<li class="' + chatClass + '">').append($('<span class="avatar-wrapper small inline-block">').append($('<img src="' + data.avatar + '">'))).append($('<div class="message">').text(data.message).append($('<div>').text(data.userName)).append($('<div class="timestamp">').text(data.timeStamp))));
    });
    
    /*
     * Show a leave or join message in the browser.
     * There are two types of messages. Leave and Join.
     * It allows to style these messages independent of each other.
     */
    socket.on('user join leave', function(data) {
        var userClass = 'left';
        if (data.isJoined) {
            userClass = 'joined';
        }
        $('#messages').append($('<li class="' + userClass + '">').text('User "' + data.userName + '" ' + userClass + ' the chat').append($('<span>').text(data.timeStamp)));
    });
    
    /*
     * Show the submitted filename as a message in the browser.
     * Do this via a link, so you can download it easily by clicking on this link.
     */
    socket.on('file', function(data) {
        var chatClass = "message-wrapper";
        if (data.own) {
            chatClass += " own";
        }
        if (data.direct) {
            chatClass += " direct";
        }
        $('#messages').append($('<li class="' + chatClass + '">').append($('<div class="avatar-wrapper small inline-block">').append($('<img src="' + data.avatar + '">'))).append($('<div class="message">').append($('<a href="' + data.filePath + data.fileName + '">').text(data.fileName)).append($('<div class="timestamp">').text(data.timeStamp).append($('<i class="material-icons">').text('attachment')))));
    });

    socket.on('remove', function() {
        $('.mng-keys').remove();
    });
    
    
    socket.on('weather', function(data) {
        var $text = $('<li class="users">').text('All active users').append($('<span>').text(data.timeStamp));
        
        $text = $text.append($('<div>').text(data.weather));
        $('#messages').append($text);
    });
    
    
    
    /*
     * It is difficult to style an input-file type field.
     * This workaround is replacing the input-file type field by a button field providing the same functionality as the input-file type field.
     */
    $('#file').before('<button id="button-file"><i class="material-icons">attachment</i></button>');
    $('#file').hide();
    $('body').on('click', '#button-file', function() { 
        $('#file').trigger('click');    
    });
    
    /*
     * It is difficult to style an input-file type field.
     * This workaround is replacing the input-file type field by a button field providing the same functionality as the input-file type field.
     */
    $('#file-avatar').before('<button id="button-file-avatar"><i class="material-icons">file_upload</i></button>');
    $('#file-avatar').hide();
    $('body').on('click', '#button-file-avatar', function() { 
        $('#file-avatar').trigger('click');    
    });
    
    /*
     * Clear everything if the "X"-Button is clicked.
     */
    $('footer #clear').click(function() {
        file = undefined;
        $('#upload').css('width', '0%');
        $('#message').val('');
        $('footer > button#button-file > i').css('color', 'black');
    });
    
});

/*
 * Upload a file to the server if a file is available.
 */
$.fn.uploadFile = function() {
    if (file !== undefined) {
        var stream = ss.createStream();
        var $upload = $('#upload');
        var fileSize = file.size;
        // upload a file to the server.
        ss(socket).emit('file', stream, {fileSize: fileSize, fileName: file.name, fileType: file.type});
        var blobStream = ss.createBlobReadStream(file);

        var size = 0;
        // Show the transmitted filesize in a progress bar
        blobStream.on('data', function(chunk) {
            size += chunk.length;
            width = (Math.floor(size / fileSize * 100) + '%').trim();
            $upload.css('width', width);
        });

        blobStream.pipe(stream);   
    }
    //Clean up
    file = undefined;
    $('footer > button#button-file > i').css('color', 'black');
    $('#upload').css('width', '0%');
}



