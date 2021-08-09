var score = 0
var answer_selected = -1
var myID = 0
var myUsername = ''
var socket = io();
var isPlaying = false;
var difficulty_str = ['easy', 'medium', 'hard']

// variables for timer
var t = 0
var max = t
var interval = null
var percentage = 100;

$(document).ready(function(){
   // initialize
   randomID = Math.floor(Math.random()*10000)
   IDLen = Math.floor(Math.log10(randomID))+1
   IDString = '0000'.slice(IDLen) + String(randomID)
   myUsername = 'Florist' + IDString

   $('#username').val(myUsername)
   socket.emit('add user', {'userID': randomID, 'username': myUsername})
   myID = randomID

   $('#start-button').click(function(){
      data ={
         'difficulty': parseInt($('#difficulty').val()),
         'shuffle': $('#shuffle').prop('checked'),
         'round_length': parseInt($('#round-length').val()),
      }
      socket.emit('start game', data)
   });

   $('#edit-name-button').click(function(){
      myUsername = $('#username').val()
      socket.emit('edit name', {'userID': myID, 'username': myUsername})
   });

   $('#return-lobby-button').click(function(){
      $('#edit-name-button').show()
      $('.button-container').show()
      $('#answer-zone').hide()
      $('.timercontainer').hide()
      $('#score-area').hide()
      $(this).hide()
      $('#dice-zone').empty();
      $('.answered-players').empty();
      $('.answer-button').removeClass('correct-button incorrect-button');
      $('#user-area').show()
      $('#username').prop("disabled", false)
      isPlaying = false;
   });
   
   $('.answer-button').click(function(){
      if (!isPlaying || answer_selected >= 0)
         return;

      isPlaying = false;
      $(this).addClass('selected-button')
      answer_selected = parseInt($(this).val()-1);
      d = new Date()
      answer_data = {
         'userID': myID,
         'username': myUsername,
         'answer': $(this).val()-1,
         'time': d.getTime()
      };
      socket.emit('answer', answer_data)
   });

   /*
   server listener
   */

   socket.on("users", (users) => {
      $('#user-area').empty()
      $('#user-area').append(
         $('<h2>').text("Players")
      )
      for (s in users){
         $('#user-area').append(
            $('<div/>').text(users[s]).addClass('user-list')
         )
      }
    });

   socket.on('new game', function(data) {
      $('.button-container').hide()
      $('#answer-zone').show()
      $('.timercontainer').show()
      $('#edit-name-button').hide()
      $('#score-area').show()
      $('#user-area').hide()
      $('#username').prop("disabled", true)
      socket.emit('update game state', data)
      setTimer(5, 'cyan')
      updateScore(data);
   });

   socket.on('new round', function(data) {
      newRound(data);
   });

   socket.on('update answers', function(data) {
      // update interface to show who has already answered
      $('.answered-players:eq(' + String(data['answer']) + ')').append(
         $('<div/>').text(data['username'])
      )
   });

   socket.on('update client game state', function(data){
      socket.emit('update game state', data)
   });
   
   socket.on('end round', function(data){
      isPlaying = false;
      $('.answer-button').removeClass('selected-button');
      if(answer_selected >0 && answer_selected != data['round_answer'])
         $('.answer-button:eq(' + String(answer_selected) + ')').addClass('incorrect-button')
      $('.answer-button:eq(' + String(data['round_answer']) + ')').addClass('correct-button')
      updateScore(data)

      setTimer(5, 'cyan')
      socket.emit('update game state', data)
      socket.emit('clear round end timer')
   });

   socket.on('end game', function(data){
      $('#return-lobby-button').show()
      socket.emit('clear round end timer')
   });

   /*
   helpers
   */

   function newRound(data){
      flowers = data['flowers']
      $('#dice-zone').empty();
      $('.answer-button').removeClass('correct-button incorrect-button');
      $('.answered-players').empty();
      updateScore(data);
      isPlaying = true;
      
      answer_selected = -1;

      dice_map = ['A', 'B', 'C', 'D']
      flower_images = []
      for (i = 0; i < flowers.length; i++){
         img_dir = 'img/' + dice_map[flowers[i]['color']] + String(flowers[i]['type']+1) + '.png' //index starts from 0, but image starts from 1
         $('#dice-zone').append(
            $('<img/>').attr('src', img_dir).addClass('flower-img')
         )
         if (i%3 == 2)
            $('#dice-zone').append('<br>')
      }

      socket.emit('update game state', data)
      $('.progress_bar').css('background-color', 'orangered')
      setTimer(10, 'orangered')
   };

   function updateScore(data){
      $('#score-area').empty()
      $('#score-area').append(
         $('<span>').text('Round ' + data.round + '/' + data.round_length).addClass('round-counter'),
         $('<br/>'),
         $('<span>').text('Difficulty: ' + difficulty_str[data.difficulty-1] + ',   Shuffle: ' + data.shuffle)
      )
      var table = $('<table>').addClass('score-table')
      table.append(
         $('<tr>').append(
            $('<th>').text('Rank'),
            $('<th>').text('Player'),
            $('<th>').text('Score')
         )
      )
      var items = []
      for (var i in data.players)
         items.push([data.players[i], data.player_scores[i]])

      items.sort(function(first, second){
         return second[1] - first[1];
      });

      console.log(JSON.stringify(items))
   
      rank = 1
      for (var i = 0; i < items.length; i ++) {
         if (i == 0 || items[i][1] != items[i-1][1])
            rank = i+1
         table.append(
            $('<tr>').append(
               $('<td>').text(rank),
               $('<td>').text(items[i][0]),
               $('<td>').text(items[i][1])
            )
         )
      }

      $('#score-area').append(table)
   }
   function setTimer(t, c){
      $('.progress_bar').css('background-color', c)
      clearInterval(interval)
      max = t
      interval = setInterval(function(){
         t = t - 0.01;
         if (t <= 0) {
            t=0;
            clearInterval(interval);
         }

         percentage = 100-((t/max)*100);
            $(".progress_bar").width(percentage + "%");
         }, 10);
      }
});