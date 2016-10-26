module.exports = function(io) {

    var config = require('./config.json');
    var express = require('express');
    var router = express.Router();

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

    return router;
}