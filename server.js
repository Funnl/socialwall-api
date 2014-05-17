var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs')

app.listen(8080);

function handler (req, res) {
  fs.readFile(__dirname + '/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }

    res.writeHead(200);
    res.end(data);
  });
}

io.sockets.on('connection', function (socket) {
	console.log("Making request");
	request('http://www.google.com', function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	    //console.log(body) // Print the google web page.
		socket.emit('listing', {data: body});    
	  }
	  else
	  {
	  	socket.emit('news', error);
	  }
	});

  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});

var request = require('request');