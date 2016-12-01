/*
 * This module is used to store all helper methods which should be available in the server.
 */

var sha256 = require('js-sha256').sha256;
var fs = require("fs");
var request = require('request');

module.exports = {
    /*
     * Check if a given bluemix service is available.
     */
    isServiceAvailable: function(bluemixService) {
        return (bluemixService !== null && bluemixService !== undefined);
    },

    /*
     * Returns the Timestamp.
     * If onlyTime is true, this method returns only the current time.
     */
    getTimestamp: function (locale, onlyTime) {
        var now = new Date(Date.now());
        if (onlyTime) {
            return now.toLocaleTimeString(locale);  
        } else {
            return now.toLocaleDateString(locale) + " " + now.toLocaleTimeString(locale);
        }
    },


    /*
     * Decode base64 image and store it in the given directory with the given filename.
     * Return the file extension so you can use it later.
     */
    base64ImageToFile: function(base64image, directory, filename) {
        var ext = base64image.split(';')[0].match(/jpeg|png|gif|jpg/)[0];
        var data = base64image.replace(/^data:image\/\w+;base64,/, "");
        var buf = new Buffer(data, 'base64');
        fs.writeFile(directory + filename + '.' + ext, buf);

        return ext;
    },

    /*
     * Generate a salt.
     * Taken from: //https://codepen.io/Jvsierra/pen/BNbEjW
     */
    generateSalt: function() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    },

    /*
     * Encrypt the password by concatenating it with a generated salt und hashing it with sha256.
     */
    hashPassword: function(password, salt) {
        return sha256(password + salt);
    },
    
    /*
     * Request the weather for a city by calling the weater company service rest api.
     * Return the weather data (48h forecast) for the city.
     */
    requestWeather: function(weatherUrl, city, callback) {
        request(weatherUrl + '/api/weather/v3/location/search?query=' + city + '&language=en-US', function (error, response, locationData) {
            if (!error && response.statusCode == 200) {
                locationData = JSON.parse(locationData);
                request(weatherUrl + '/api/weather/v1/geocode/' + locationData.location.latitude[0] + '/' + locationData.location.longitude[0] + '/forecast/hourly/48hour.json', function (error, response, weatherData) {
                    if (!error && response.statusCode == 200) {
                        weatherData = JSON.parse(weatherData);
                        callback(false, weatherData);
                    } else {
                         callback(true);
                    }
                }); //END WEATHER-REQUEST
            } else {
                callback(true);
            }
        });//END COORDINATE-REQUEST*/  
    }
};