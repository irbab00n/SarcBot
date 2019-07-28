// "Bring in" the Discord module into this file.
// The file contains all of the methods to connect the client using the authorized token
// generated within the discord developer portal
// https://discordapp.com/developers/docs/intro
// Click on the 'make an app' page, and this is where all of our developer code lives
// However, since it is tied to my personal email, I will not be sharing this info
const Discord = require('discord.js');
// "Bring in" the defined prefix and token from our configuration file
const {
  prefix,
  token
} = require('./config.json');
// "Bring in" the YouTube Downloader module that will allow us to connect to YouTube and 
// get our songs to play!
const ytdl = require('ytdl-core');

// Create a new client instance using the Discord module's Client class
const client = new Discord.Client();

// Create a queue using a Map data structure
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
const queue = new Map();


// Log the client in using our authorized token
client.login(token);

// Establish basic start up, connection, and disconnection prompts
client.once('ready', () => {
  console.log('SarcBot is now Ready!');
});
client.once('reconnecting', () => {
  console.log('SarcBot says, "Did you miss me?"');
});
client.once('disconnect', () => {
  console.log('My name is SarcBot, you stay classy, Gamers Paradise');
});

// Define what our bot will do when a message is received
client.on('message', async message => {
  // Check if the new message was created by the SarcBot
  if (message.author.bot) return; // Return implictly closes this function, no further code is run

  // Check if the message doesn't start with our defined prefix
  if (!message.content.startsWith(prefix)) return; // Return implictly closes this function, no further code is run

  // If neither of the above control flow statements caused this function
  // to stop running early, then we can assume the message was designated
  // to tell SarcBot what to play
  const serverQueue = queue.get(message.guild.id);

  // Depending on what the message starts with, we need to know
  // what we want the SarcBot to do
  if (message.content.startsWith(`${prefix}play`)) {
    processSongRequest(message, serverQueue);
    return;
  } else if (message.content.startsWith(`${prefix}skip`)) {
    skip(message, serverQueue);
    return;
  }  else if (message.content.startsWith(`${prefix}stop`)) {
    stop(message, serverQueue);
    return;
  } else {
    message.channel.send('You sperg, you need to enter in a valid command!');
  }

});


// Processes the request using the message and the current song queue data structure
async function processSongRequest(message, serverQueue) {
  // split the message string into a list of the words; '!play https://...' => ['!play', 'https://...']
  // This allows individual words of the query to be analyzed and accesed directly via index access; e.g. array[1]
  const args = message.content.split(' '); 
  
  const voiceChannel = message.member.voiceChannel;
  // console.log(`User in channel: `, voiceChannel);
  if (!voiceChannel) {
    return message.channel.send('SarcBot needs to be in a voice channel to play music!');
  }
  
  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
    return message.channel.send('Sarc apparently hasn`t figured out how to read the documentation correctly; SarcBot doesn`t have the permissions it needs to connect or speak. One or both of the two.');
  }

  // Saving the value outside of where the data is used as an argument
  // is a "best practice" and is encouraged for increased developer readability
  const expectedQuery = args[1]; 
  const songInfo = await ytdl.getInfo(expectedQuery);
  // Map the songInfo properties to a new object that our serverQueue can process
  const song = {
    title: songInfo.title,
    url: songInfo.video_url
  };


  // Check to see if we have a current serverQueue contract
  // (if the bot is playing something and has a queue or not)
  if (!serverQueue) {
    // No contract exists, we must create one
    const queueContract = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true
    };
    // Set the queue using our contract
    queue.set(message.guild.id, queueContract);
    // Push the found song into the queue's songs array
    queueContract.songs.push(song);

    try {
      var connection = await voiceChannel.join();
      queueContract.connection = connection;
      // Play the current song
      play(message.guild, queueContract.songs[0]);
    } catch (error) {
      // if something went wrong, log the error
      console.log('Something went wrong while trying to connect to the voiceChannel', error);
      // delete the guild id from the queue
      queue.delete(message.guild.id);
      // send the error message to the channel
      return message.channel.send(error);
    }

  } else {
    // If a contract already exists
    serverQueue.songs.push(song);
    console.log(serverQueue.songs);
    return message.channel.send(`SarcBot added ${song.title} to the queue!`);
  }
    
}


// How songs are played
// ? Figure out what guild is for sure and how it relates to the channel
function play(guild, song) {
  const serverQueue = queue.get(guild.id);
  // If there is no song
  if (!song) {
    // Leave the channel
    // OPTIONAL: send a random fuck you to the channel?
    serverQueue.voiceChannel.leave();
    // delete the guild id from the queue
    queue.delete(guild.id);
    // stop the recursive loop
    return;
  }
  // create a dispacher
  const dispatcher = serverQueue.connection.playStream(
    ytdl(song.url, { filter: 'audio', quality: 'highestaudio', highWaterMark: 1<<25, bitrate: 192000 })
      .on('end', () => {
        // Deletes the finished soong from the queue
        serverQueue.songs.shift();
        // Calls the play function again with the next song in the list
        play(guild, serverQueue.songs[0]);
      })
      .on('error', error => {
        // If dispatcher failed to stream the song data through the connection, error out to the console
        console.error('Something has gone wrong while trying to use connection.playStream.  @ serverQueue.connection.playStream()', error);
      }));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5); // IDK why volume / 5?  We'll find out later
}



// How songs are skipped
function skip(message, serverQueue) {
  if (!message.member.voiceChannel) {
    return message.channel.send('SarcBot must be in a voice channel to skip the music!');
  }
  if (!serverQueue) {
    return message.channel.send('SarcBot has no song that it could skip!');
  }
  serverQueue.connection.dispatcher.end();
}



// How songs are stopped
function stop(message, serverQueue) {
  if (!message.member.voiceChannel) {
    return message.channel.send('SarcBot must be in a voice channel in order to stop the music!');
  }
  // Clear the cache of songs
  serverQueue.songs = [];
  // End the music dispatcher on the connection
  serverQueue.connection.dispatcher.end();
}


