var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs');

var _ = require('lodash');

var moment = require('moment');

var tag = "angelhack";

var url = require('url');
var tagsearch = 'https://api.instagram.com/v1/tags/' + tag + '/media/recent?client_id=5b77c97181bf4089a71f7a44ce752122';

app.listen(8080);

var Stream = require('user-stream');
var stream = new Stream({
    consumer_key: 'bTVA9hrjxVEQ1on14lhUdjIKk',
    consumer_secret: 'xKCWoEGoBqWzUtX6kHv5LOI99f4BhUaCUpPgNv4r1G6UjE7ovx',
    access_token_key: '2495773801-qSTk9wtEO8H3I4fd9Lw2kICXwocPbeHvO7y1RxK',
    access_token_secret: 'xP6PeNoCcEft1sGVytIkq8JZC0OxMAuDwT7TT39ghfP1k'
});

var params = {
    track: tag
};

stream.stream(params);

var tweets = [];


stream.on('data', function(json) {
	console.log("Got twitter updates");
	if(json){
		if(json.friends){
			console.log("Skipping twitter update about friends");
		} else if(json.text) {
			tweets.push(json); // add to beginning
			io.sockets.emit('twitter', json);
		}
		else
		{
			console.log("Skipping twitter update about else condition");
		}
	}
});

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
				//console.log('BODY: ' + chunk.toString());
				console.log("Sending update to everyone");
				res.end("Got instagram data and sent to all clients");
				request(tagsearch, function (error, response, body) {
				  if (!error && response.statusCode == 200) {
				  	instagram_past_search = body;
				  	lastSearch = moment();
				  	io.sockets.emit('instagram', body);  
				  }
				  else
				  {
				  	socket.emit('error-log', error);
				  }
				});
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
		console.log("New client... searching for existing photos");
		request(tagsearch, function (error, response, body) {
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
		console.log("New client... using cache of existing photos");
		socket.emit('instagram', instagram_past_search);
	}

	_.forEach(tweets, function(tweet){
		socket.emit('twitter', tweet);
	})

	/*
  socket.on('my other event', function (data) {
    //console.log(data);
  });
*/
});

var request = require('request');