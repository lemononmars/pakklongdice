var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server, {
   cors: {
       origin: "http://localhost:8000",
       methods: ["GET", "POST"],
       transports: ['websocket', 'polling'],
       credentials: true
   },
   allowEIO3: true
});
var port = process.env.PORT || 8000;

app.use(express.static('public'));

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

server.listen(port, function(){
  console.log('listening on *:' + port);
});

// variables for gamelist lobby
var isRoomActive = false;
var users = {};
var playingUsers = {}; // to be implemented later?
var waitingUsers = {};

/*
  START IO
*/
io.on('connection', function(socket){
  var addedUser = false;

  /* debuggin!
  socket.onAny((event, ...args) => {
    console.log(event, args);
  });*/

  socket.on('add user', function(data) {
    addedUser = true;
    socket.username = data['username'];
    socket.userID = data['userID']
    users[socket.userID] = socket.username
    io.emit("users", users);
  });

  // disconnect a user
  socket.on('disconnect', function(){
    if (addedUser) {
      delete users[socket.userID];
      addedUser = false;
      io.emit("users", users);
    }
  });

  socket.on('edit name', function(data){
    users[data.userID] = data.username
    io.emit("users", users);
  });

  // game sutaato !
  socket.on('start game', function(data) {
    if(isRoomActive){
      return;
    }
    else{
      var players = users
      var player_scores = {}
      for (var i in users){
        player_scores[i] = 0
      }
      
      socket.gameState = {
        'difficulty': data.difficulty,
        'shuffle': data.shuffle,
        'round_length': data.round_length,
        'round': 0,
        'solo': Object.keys(players).length == 1,
        'round_start': 0,
        'players': players, // automatically add all active players to the game
        'player_scores': player_scores,
        'flowers': [],
        'round_answer': -1,
        'answered_players': {}
      }
      isRoomActive = true;
      io.emit('new game', socket.gameState)
      setTimeout(newRound, 5000)
    }
  });

  socket.on('update game state', function(data){
    socket.gameState = data
  });

  socket.on('answer', function(data){
    // don't allow new players to just join in
    if (!(data.userID in socket.gameState.players))
      return;

    socket.gameState.answered_players[data.userID] =
    {
      'answer': data.answer,
      'time': data.time
    }
    io.emit('update client game state', socket.gameState)
    io.emit('update answers', data)
    if (Object.keys(socket.gameState.answered_players).length == Object.keys(socket.gameState.players).length)
      roundEnd()
  });

  socket.on('clear round end timer', function(){
    clearTimeout(socket.timeOut)
  });

  /*
  helpers
  */

  function newRound(){
    dice_pool=[
        [0,1,2], [0,1,3], [0,2,3], [1,2,3]
    ]
    dice_set = []
    diff = parseInt(socket.gameState.difficulty)
    switch(diff){
        case 1: 
          var t = Math.floor(Math.random()*3)
          dice_set = [t,t,t]; break;
        case 2: 
          var t1 = Math.floor(Math.random()*3)
          var t2 = (t1+1)%3
          dice_set = [t1,t1,t1,t2,t2]; break;
        case 3: dice_set = [0,0,0,1,1,1,2,2,2]; break;
        default: dice_set = [0,0,0,1,1,1,2,2,2,3,3,3]; break; // for advanced mode
    }

    flowers = []
    flower_ans = []
    for (i = 0; i < dice_set.length; i++){
        flower = dice_pool[dice_set[i]][Math.floor(Math.random()*3)]
        flowers.push({'color':dice_set[i], 'type':flower})
        flower_ans.push(flower)
    }

    /* find solution (before shuffling if needed) */
    if (diff == 1)
      answer = get_answer(flower_ans.slice(0,3))
    else if (diff == 2){
      a1 = get_answer(flower_ans.slice(0,3))
      newf = flower_ans.slice(3,5)
      newf.push(a1)
      answer = get_answer(newf)
    }
    else if (diff == 3){
      a1 = get_answer(flower_ans.slice(0,3))
      a2 = get_answer(flower_ans.slice(3,6))
      a3 = get_answer(flower_ans.slice(6,9))
      answer = get_answer([a1, a2, a3])
    }
    else
      answer = -1 // level 4: to be added later

    if (socket.gameState.shuffle)
        shuffleArray(flowers)

    socket.gameState.round++
    socket.timeOut = setTimeout(roundEnd, 10000)
    socket.gameState.flowers = flowers
    socket.gameState.round_answer = answer
    d = new Date()
    socket.gameState.round_start_time = d.getTime()
    io.emit('new round', socket.gameState)
  }

  function roundEnd(){
    // scoring
    correct_answer = socket.gameState.round_answer
    answers = socket.gameState.answered_players
    
    // no answer = 0
    // incorrect -> (-10)*number of incorrect players faster than you
    // i.e. still the faster, the better!
    var correct_players = []
    var incorrect_penalty = 0;
    for (var p in socket.gameState.players){
      if(p in answers){
        if (answers[p].answer === correct_answer)
          correct_players.push([p, answers[p].time])
        else
          socket.gameState.player_scores[p] -= 10*(incorrect_penalty++)
      }
    }

    // the faster, the better!
    if(correct_players.length > 0){
      correct_players.sort(function(first, second){
        return first[1] - second[1]
      });
      var fastest_time = correct_players[0][1]
      // for solo mode, start from 0
      if(socket.gameState.solo)
        fastest = socket.gameState.round_start_time
      for (cp in correct_players){
        // 1 second late (1000 millisecond) = 10 points off
        var bonus = 100 + Math.floor((fastest_time - correct_players[cp][1])/100);
        socket.gameState.player_scores[correct_players[cp][0]] += bonus
      }
    }

    // reset answers and proceed
    socket.gameState.answered_players = {}
    
    if (socket.gameState.round == socket.gameState.round_length) {
      io.emit('end round', socket.gameState);
      setTimeout(gameEnd, 5000)
    }
    else {
      io.emit('end round', socket.gameState);
      setTimeout(newRound, 5000)
    }
  }

  function gameEnd(){
    isRoomActive = false;
    io.emit('end game', socket.gameState)
    socket.gameState = [];
  }

  function get_answer(f){
    a = -1
    if (f[0] == f[1])
        if (f[0] == f[2])
          a = f[0]
        else
          a = f[2]
    else if (f[0] == f[2])
          a = f[1]
        else if (f[1] == f[2])
          a = f[0]
        else 
          a = 6-f[0]-f[1]-f[2]
    return a
   }

   function shuffleArray(array) {
      for (var i = array.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var temp = array[i];
          array[i] = array[j];
          array[j] = temp;
      }
  }
});
