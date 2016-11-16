var rmdir = require('rmdir');
var mkdirp = require('mkdirp');

module.exports = function(io) {

    var config = require('./config.json');
    var express = require('express');
    var router = express.Router();

    /*
     * Redirect so https if you call http.
     * This ensures, that the application always uses TLS.
     * This is adapted from: https://github.com/aerwin/https-redirect-demo
     */
    router.use (function (req, res, next) {
        if (req.secure) {
            next();
        } else {
            // request was via http, so redirect to https
            res.redirect('https://' + req.headers.host + req.url);
        }
    });
    
    /*
     * Include static files like css/js via middleware.
     */
    router.use(express.static(__dirname + '/public'));

    /*
     * Main Routing handler
     */
    router.get('/', function(req, res) {
        res.sendFile(__dirname + '/public/index.html');
    });
    
    /*
     * Allow to download files
     */
    router.get('/' + config.filePath + ':filename(*)', function(req, res) {
        var file = req.params.filename;
        var path = __dirname + "/" + config.filePath + file;

        res.download(path);
    });
    
    router.delete('/removeuploadedfiles', function(req, res) {
        var path = __dirname + "/" + config.filePath;
        res.status(204);
        rmdir(path, function (err, dirs, files) {
            if (err) {
                res.status(500); 
                console.error(err);
            } else {
                console.log('all files are removed');   
            }
        });
        
        setTimeout(mkdirp(path, function (err) {
            if (err) {
                res.status(500);
                console.error(err)
            } else {
                console.log('directory created');
            }
        }), 3000);
        res.send();
    });

    return router;
}