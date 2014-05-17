var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs');

var moment = require('moment');

var url = require('url');

app.listen(8080);

function handler (req, res) {
	var u = url.parse(req.url, true);
	var utest = u.pathname.toString();
	console.log("Pathname = '" + utest + "'");
	console.log("Equals1 = '" + (utest == "/") + "'");

	if(utest == "/"){
		console.log("Serving index file");
		fs.readFile(__dirname + '/index.html',
		  function (err, data) {
		    if (err) {
		      res.writeHead(500);
		      return res.end('Error loading index.html');
		    }

		    res.writeHead(200);
		    res.end(data);
		  });
	} else if (utest == '/instagram')
	{
		if(u.query && u.query["hub.mode"])
		{
			res.end(u.query["hub.challenge"]);
		}
		else
		{
			console.log("Waiting for data to process the instagram post");
			req.on('data', function (chunk) {
				console.log('BODY: ' + chunk.toString());
				console.log("Sending update to everyone");
				io.sockets.emit('instagram', chunk.toString());
				res.end("Got instagram data and sent to all clients");
			});
		}
		
	}
	else
	{
		console.log("Ignoring other requests");
	}
}

var instagram_past_search = null;
var lastSearch = moment().subtract('days', 1);

io.sockets.on('connection', function (socket) {
	console.log("Making Instagram search Request");
	var now = moment();
	if(!instagram_past_search || now.subtract('minutes', 30).isAfter(lastSearch))
	{
		request('https://api.instagram.com/v1/tags/angelhacktest/media/recent?client_id=5b77c97181bf4089a71f7a44ce752122', function (error, response, body) {
		  if (!error && response.statusCode == 200) {
		  	instagram_past_search = body;
		  	lastSearch = moment();
			socket.emit('instagram', body);    
		  }
		  else
		  {
		  	socket.emit('error-log', error);
		  }
		});
	}
	else
	{
		socket.emit('instagram', instagram_past_search);
	}

	/*
  socket.on('my other event', function (data) {
    //console.log(data);
  });
*/
});

var request = require('request');