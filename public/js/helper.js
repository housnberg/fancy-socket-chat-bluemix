/*
 * This helper module should only consist of client-side helper methods.
 */

module.exports = {

    /*
     * Add a validation message to a JQeury UI Dialog Element and mark the validated vields if any available.
     */
    addValidationMessage: function(validationMessage, $validationMessageField, allFields) {
        $validationMessageField.text(validationMessage);
        if (allFields !== undefined) {
            allFields.addClass('ui-state-error');
        }
    },

    /*
     * Remove the validation messages from the JQeury UI Dialog Element.
     */
    clearValidationMessage: function($validationMessageField, allFields) {
        $validationMessageField.empty();
        if (allFields !== undefined) {
            allFields.removeClass('ui-state-error');   
        }
    },

    /*
     * Start webcam and stream the data on the given video-html 5 element
     */
    startWebcamVideo: function($video) {
        var video = $video.get(0); //Play is not a JQuery function so get the html-dom element
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            // Not adding `{ audio: true }` since we only want video now
            navigator.mediaDevices.getUserMedia({ video: true }).then(function(stream) {
                localStream = stream;
                video.src = window.URL.createObjectURL(stream);
                video.play();
            });
        }
    },
    
    /*
     * Stop the webcam and stop the video stream
     */
    stopWebcamVideo: function($video) {
        var video = $video.get(0); //Play is not a JQuery function sop get the html-dom element
        video.pause();
        localStream.getVideoTracks()[0].stop();
    },

    /*
     * Snap a picture and draw the picture from the given video element on the given canvas element.
     */
    takePicture: function($canvas, $video) {
        var canvas = $canvas.get(0);
        var context = canvas.getContext('2d');
        var video = $video.get(0);
        context.drawImage(video, 0, 0, $canvas.attr("width"), $canvas.attr("height"));
    },

    /*
     * Convert the given canvas image to an base64 encoded image.
     */
    convertCanvasToImage: function($canvas) {
        var canvas = $canvas.get(0);
        var image = new Image();
        image.src = canvas.toDataURL("image/png");

        return image;
    },

    /*
     * Encode an image to its base64 representation.
     * The image ratio should be conserved!.
     */
    readURL: function(input, $avatar, maxWidth, maxHeight, maxFileSize, callback) {
        if (input) {
            var reader = new FileReader();
            var img = new Image();
            var fileSize = Math.round(input.size / 1024);
            var canvas = document.createElement('canvas');

            reader.onload = function (e) {
                img.src = e.target.result;
                img.onload = function () {
                    var imgWidth = this.width;
                    var imgHeight = this.height;
                    if (imgWidth > maxWidth || imgHeight > maxHeight || fileSize > maxFileSize) {
                        canvas.width = maxWidth;
                        canvas.height = maxHeight;
                        
                        var ratio = scalePreserveAspectRatio(imgWidth, imgHeight, maxWidth, maxHeight);
                        
                        canvas.width = imgWidth * ratio;
                        canvas.height = imgHeight * ratio;
                        
                        var context = canvas.getContext('2d');
                        context.drawImage(img, 0, 0, canvas.width, canvas.height);
                        
                        $avatar.attr('src', canvas.toDataURL("image/png"));
                        callback(true);
                        
                    } else {
                        callback(true);
                        $avatar.attr('src', img.src);
                    }
                };

            };

            reader.readAsDataURL(input);
        }
    },
    
    /*
     * Convert fahrenheit to celsius.
     */
    fahrenheitToCelsius: function(fahrenheit) {
        return ((parseFloat(fahrenheit) - 32) / 1.8).toFixed(2);
    }
    
};

/*
 * Calculate the image ratio.
 */
function scalePreserveAspectRatio(imgW, imgH, maxW, maxH) {
    return (Math.min((maxW / imgW), (maxH / imgH)));
};