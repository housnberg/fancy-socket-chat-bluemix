var file;
var roomToJoin;

var io = require('socket.io-client');
var ss = require('socket.io-stream');

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
        var $validationMessage = $loginDialog.find('.validation-message');
        var $successMessage = $loginDialog.find('.success-message');
        var $allFields = $([]).add($usernameField).add($passwordField);
        $().clearValidationMessage($validationMessage, $allFields);
        $successMessage.empty();
        var data = {userName: username, password: md5(password)}; //Hash the password 
        if (username && password) {
            //Determine if the "register" oder the "login" submit button was clicked
            if (clickedButtonName === "Register") {
                socket.emit('user registration', data, function(isRegistered) {
                    if (isRegistered) {
                        $successMessage.text('The registration was successfull! You can now login with your data.');
                    } else {
                        $().addValidationMessage('The user with the username "' + username + '" already exists.', $validationMessage);
                    }
                });
            } else {
                socket.emit('user join', data, function(isJoined) {
                    if (isJoined) {
                        $loginDialog.dialog('close');
                    } else {
                        $().addValidationMessage('The user with the username "' + username + '" does not exist or the password is wrong.', $validationMessage);
                    }
                });    
            }
            $loginForm[0].reset();
        } else if (password) {
            $().addValidationMessage('Please specify a username.', $validationMessage, $usernameField);
        } else if (username) {
            $().addValidationMessage('Please specify a password.', $validationMessage, $passwordField);
        } else {
            $().addValidationMessage('Pleayse specify a username and a password.', $validationMessage, $allFields);
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
        $().clearValidationMessage($validationMessage, $passwordField);
        if (roomPassword) {
            socket.emit('join room', {roomName: roomToJoin, roomPassword: md5(roomPassword)}, function(isJoined) {
                if (isJoined) {
                    $('#messages').empty();
                    $('#rooms .room.current').toggleClass('current');
                    $('#rooms .room#' + roomToJoin).toggleClass('current');
                    $joinRoomDialog.dialog('close');
                } else {
                    $().addValidationMessage('The password is not correct.', $validationMessage, $passwordField);
                }
            });
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
        $().clearValidationMessage($validationMessage, $allFields);
        if (roomName && roomPassword) {
            if (roomName.length < 3 || roomName.length > 20) {
                $().addValidationMessage('The length of the roomname must lay between 3 und 20 chars.', $validationMessage, $roomNameField);
            } else {
                socket.emit('create room', {roomName: roomName, roomPassword: md5(roomPassword)});
                $createRoomDialog.dialog('close');
            }
        } else if (roomName) {
            $().addValidationMessage('Please specify a password.', $validationMessage, $roomPasswordField);
        } else if (roomPassword) {
            $().addValidationMessage('Please specify a room name.', $validationMessage, $roomNameField);
        } else {
            $().addValidationMessage('Please specify a room name and a password.', $validationMessage, $allFields);
        }
        $createRoomForm[0].reset();
        return false;
    });
    
    $('#create').on('click', function() {
        $createRoomDialog.dialog('open');
    });
    
    /*
     * Displays the newly created rooms in a sidebar.
     * Add a click handler to the last created room. You can then enter a password.
     */ 
    socket.on('create room', function(roomData) {
        $('#rooms').append($('<li class="room" id="' + roomData.roomName + '">').text(roomData.roomName)); 
        //Assign a click handler the the newly created room
        var $lastCreatedRoom = $('#rooms .room:last-child');
        $lastCreatedRoom.on('click', function() {
            roomToJoin = $(this).text();
            if (roomToJoin !== $('#rooms .room.current').text()) {
                $joinRoomDialog.dialog('open');   
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
        $('#messages').append($('<li class="' + chatClass + '">').append($('<span class="username">').text(data.userName)).append($('<div class="message">').text(data.message).append($('<div class="timestamp">').text(data.timeStamp))));
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
        $('#messages').append($('<li class="' + chatClass + '">').append($('<span class="username">').text(data.userName)).append($('<div class="message">').append($('<a href="' + data.filePath + data.fileName + '">').text(data.fileName)).append($('<div class="timestamp">').text(data.timeStamp).append($('<i class="material-icons">').text('attachment')))));
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

$.fn.addValidationMessage = function(tips, $tipsField, allFields) {
    $tipsField.text(tips);
    if (allFields !== undefined) {
        allFields.addClass('ui-state-error');
    }
}

$.fn.clearValidationMessage = function($tipsField, allFields) {
    $tipsField.empty();
    if (allFields !== undefined) {
        allFields.removeClass('ui-state-error');   
    }
}

$.fn.addSuccessMessage = function(tips, $tipsField) {
    $tipsField.text(tips);
}

$.fn.clearSuccessMessage = function($tipsField) {
    $tipsField.empty();
    if (allFields !== undefined) {
        allFields.removeClass('ui-state-error');   
    }
}