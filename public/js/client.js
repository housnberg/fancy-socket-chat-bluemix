$(document).ready(function() {
    
    var socket = io.connect();
    
     $('footer form').submit(function() {
        var $message = $.trim($('#message').val());
         
        if ($message) {
            if($message === '/users'){ //if the message is /users call function to send out the list of current users
                socket.emit('userlist');
                $('#message').val('');
            }
            else{
            socket.emit('chat message', $message);
            $('#message').val('');  
            }
        }
        return false;
    });
    
    $('#login form').submit(function(event) {
        var $input = $.trim($('#username').val());
        if ($input) {
            socket.emit('user join', $input, function(isJoined) {
                if (isJoined) {
                    $('#login').fadeOut(1000);
                } else {
                    
                }
            });   
        }
        //Stop browser navigating from page
        //You could also use event.preventDefault() insted returning true
        return false;
    });
    
    /*
    *fill a own-message-box with the current users
    */
    socket.on('userlist', function(data) {
        var users='Current users:\n\n';
        for(var i=0;i<data.length;i++){
            users=users+data[i]+'\n';
        }
        $('#messages').append($('<li class="message-wrapper own">').append($('<span class="username">').text(data.userName)).append($('<div class="message">').text(users).append($('<div class="timestamp">').text(data.timeStamp))));
    });

    
    socket.on('chat message', function(data) {
        $('#messages').append($('<li class="message-wrapper">').append($('<span class="username">').text(data.userName)).append($('<div class="message">').text(data.message).append($('<div class="timestamp">').text(data.timeStamp))));
    });
    
    socket.on('chat message own', function(data) {
        $('#messages').append($('<li class="message-wrapper own">').append($('<span class="username">').text(data.userName)).append($('<div class="message">').text(data.message).append($('<div class="timestamp">').text(data.timeStamp))));
    });
    
    socket.on('user join', function(data) {
        $('#messages').append($('<li class="joined">').text('User ' + data.userName + " joined the chat").append($('<span>').text(data.timeStamp)));
    });
    
    socket.on('user left', function(data) {
        $('#messages').append($('<li class="left">').text('User ' + data.userName + " left the chat").append($('<span>').text(data.timeStamp)));
    });
    
});