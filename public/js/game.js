var score = 0
var answer_selected = -1
var myID = 0
var myUsername = ''
var socket = io();
var isPlaying = false;
var difficulty_str = ['easy', 'medium', 'hard']
var random_names = ['Rose', 'Orchid', 'Dandelion', 'Azalea', 'Jasmine', 'Lily', 'Acacia', 'Violet']
var coolDownTime = 0
var roundTimer = 0

// variables for timer
var t = 0
var max = t
var interval = null
var percentage = 100;

$(document).ready(function(){
   // initialize
   randomID = Math.floor(Math.random()*10000)
   IDString = '0000'.slice(String(randomID).length) + String(randomID)
   myUsername = random_names[Math.floor(Math.random()*random_names.length)] + IDString

   $('#username').val(myUsername)
   socket.emit('add user', {'userID': randomID, 'username': myUsername})
   myID = randomID

   $('#start-button').click(function(){
      data ={
         'difficulty': parseInt($('#difficulty').val()),
         'shuffle': $('#shuffle').prop('checked'),
         'round_length': parseInt($('#round-length').val()),
         'theme': $('#theme').val()
      }
      socket.emit('start game', data)
   });

   $('#edit-name-button').click(function(){
      myUsername = $('#username').val()
      socket.emit('edit name', {'userID': myID, 'username': myUsername})
   });

   $('#abort-button').click(function(){
      socket.emit('abort')
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
      answer_data = {
         'userID': myID,
         'username': myUsername,
         'answer': answer_selected,
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
      $('.answer-button').empty()
      $('#abort-button').show()
      $('#dice-zone').append(
         $('<div/>').addClass('dice-zone-block')
      )
      coolDownTime = data.solo? 2:5
      roundTimer = data.difficulty == 3? 15:10

      socket.emit('update game state', data)
      updateScore(data);
      for (var i = 0; i < 4; i++){
         $('.answer-button:eq(' + String(i) + ')').append(
            $('<img/>').attr('src', './img/' + data.theme + '/' + String(i+1) + '.png')
         )
      }
   });

   socket.on('new round', function(data) {
      setNewRound(data);
      coolDownAndStart()
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
      clearInterval(interval)
      isPlaying = false;
      $('.answer-button').removeClass('selected-button');
      if(answer_selected >0 && answer_selected != data['round_answer'])
         $('.answer-button:eq(' + String(answer_selected) + ')').addClass('incorrect-button')
      $('.answer-button:eq(' + String(data['round_answer']) + ')').addClass('correct-button')
      updateScore(data)

      // update score
      $('.answered-players').empty();
      for(id in data.answered_players){
         // TODO: sort by time?
         $('.answered-players:eq(' + String(data.answered_players[id]['answer']) + ')').append(
            $('<div/>').text(data.players[id] + ': ' + data.answered_players[id]['round_score'])
         )
      }
      socket.emit('update game state', data)
      socket.emit('clear round end timer')
   });

   socket.on('end game', function(data){
      $(".progress_bar").css({'width': '100%', 'background-color': 'aquamarine'})
      clearInterval(interval)
      $('#abort-button').hide()
      $('#return-lobby-button').show()
      socket.emit('clear round end timer')
   });

   /*
   helpers
   */

   function setNewRound(data){
      dice = data.dice
      updateScore(data);
      
      answer_selected = -1;
      var color_list = ['#F6A9A9', '#FFBF86', '#C2F784', '#FFF47D']
      var border_style_list = ['solid', 'dotted', 'dashed', 'double']
      // pre-load images and hide it until the next round
      var dice_next_round = $('<div/>').addClass('dice-zone-block').hide()
      for (i = 0; i < dice.length; i++){
         img_dir = 'img/' + data.theme + '/' + String(dice[i]['type']+1) + '.png' //index starts from 0, but image starts from 1
         dice_next_round.append(
            $('<span/>').append(
               $('<img/>').attr('src', img_dir).addClass('dice-img')
            ).addClass('dice-container').css({
               'background-color': color_list[dice[i]['color']],
               'border-style': border_style_list[dice[i]['color']]
            })
         )
         if (i%3 == 2)
            $(dice_next_round).append('<br>')
      }
      $('#dice-zone').append(dice_next_round)
      socket.emit('update game state', data)
   };

   // update score and ranking table
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

   function coolDownAndStart(){
      setTimer(coolDownTime);
      $('.progress_bar').css('background-color', 'cyan')
      setTimeout(function(){
         setTimer(roundTimer);
         isPlaying = true;
         $('.progress_bar').css('background-color', 'orangered')
         $('.dice-zone-block:eq(0)').remove() // remove one from previous round
         $('.dice-zone-block').show() // show current round
         $('.answer-button').removeClass('correct-button incorrect-button');
         $('.answered-players').empty();
      }, coolDownTime * 1000)
   }

   function setTimer(t){
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