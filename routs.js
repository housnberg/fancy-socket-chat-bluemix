var express = require('express');
var router = express.Router();

// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});

/*
 * Include static files like css/js via middleware.
 */
router.use(express.static(__dirname + '/public'));

/*
 * Route Handler -> 
 */
router.get('/', function(req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

module.exports = router;