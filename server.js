var	express		= require('express');

var socialWallApp = express();

socialWallApp.get('/', function(req, res){
	res.end("Social Wall Server is working");
});

socialWallApp.listen(8080);

console.log("Server listening on 8080");