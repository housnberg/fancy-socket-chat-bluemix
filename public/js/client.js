var file;

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
    $('footer form').submit(function() {
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
     * Submit the username and fade out the overlaying #login section.
     * Note: Only fade out an HTML-Element is not best practice, as you can manipulate CSS und HTML via the Browser.
     */
    $('#login form').submit(function(event) {
        var clickedButtonName = $(this).find("input[type=submit]:focus").attr("name");
        var $username = $.trim($('#username').val());
        var $password = $.trim($('#password').val());
        var data = {userName: $username, password: md5($password)}; //Hash the password 
        if ($username && $password) {
            //Determine if the "register" oder the "login" submit button was clicked
            if (clickedButtonName === "register") {
                socket.emit('user registration', data, function(isRegistered) {
                    if (isRegistered) {
                        window.alert("registered");
                    } else {
                        $('.error').append("the user with the username '" + $username + "' already exists.");
                    }
                });
            } else {
                socket.emit('user join', data, function(isJoined) {
                    if (isJoined) {
                        $('#login').fadeOut(1000);
                    } else {
                        $('.error').append("The username '" + $username + "' doesnt exist or the password is wrong.");
                    }
                });    
            }
            $('#username').val('');
            $('#password').val('');
        } else {
            $('.error').append("Please specify a username and a password.");
        }
        //Stop browser navigating from page
        //You could also use event.preventDefault() instead returning false
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