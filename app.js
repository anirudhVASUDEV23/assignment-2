const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()

app.use(express.json())

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(-1)
  }
}
initializeDBAndServer()

//register api
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const checkQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(checkQuery)
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const registerQuery = `INSERT INTO user(name,username,password,gender)
      VALUES(
        '${name}',
        '${username}',
        '${hashedPassword}',
        '${gender}'
      );`
      await db.run(registerQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

//middleware function

const check = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//api-3

app.get('/user/tweets/feed/', check, async (request, response) => {
  const {username} = request

  try {
    // Fetch the IDs of users being followed by the logged-in user
    const getFollowingQuery = `
      SELECT following_user_id
      FROM follower
      INNER JOIN user ON user_id = follower_user_id
      WHERE username = '${username}';
    `
    const followingList = await db.all(getFollowingQuery)

    // Extract user IDs
    const followingUserIds = followingList.map(row => row.following_user_id)

    // Handle case when no users are followed
    if (followingUserIds.length > 0) {
      // Create a list of user IDs for the query
      const userIdsList = followingUserIds.map(id => `'${id}'`).join(',')

      const getTweetsQuery = `
        SELECT u.username, t.tweet, t.date_time as dateTime
        FROM tweet t
        INNER JOIN user u ON t.user_id = u.user_id
        WHERE t.user_id IN (${userIdsList})
        ORDER BY t.date_time DESC
        LIMIT 4;
      `

      // Fetch tweets for the following users
      const tweets = await db.all(getTweetsQuery)

      // Send the response with the tweets
      response.send(tweets)
    } else {
      // No users followed, return an empty response
      response.json([])
    }
  } catch (error) {
    console.error('Error fetching tweets:', error)
    response.status(500).send('Internal Server Error')
  }
})

//api-4

app.get('/user/following/', check, async (request, response) => {
  const {username} = request
  const getFollowerId = `select user_id from user where username='${username}';`
  const followerIdObj = await db.get(getFollowerId)
  const followerIdnum = followerIdObj.user_id

  const getFollowingIds = `select following_user_id from follower where follower_user_id=${followerIdnum}`
  const idList = await db.all(getFollowingIds)

  const followingUserIds = idList.map(row => row.following_user_id)

  const IdsList = followingUserIds.map(id => `'${id}'`).join(',')

  const getNames = `select name from user where user_id in (${IdsList});`
  const names = await db.all(getNames)
  response.send(names)
})

//api-5
app.get('/user/followers/', check, async (request, response) => {
  const {username} = request
  const getUserId = `select user_id from user where username='${username}';`
  const userIdObj = await db.get(getUserId)
  const userIdnum = userIdObj.user_id

  const getFollowersIds = `select follower_user_id from follower where following_user_id=${userIdnum};`
  const idList = await db.all(getFollowersIds)

  const followersUserIds = idList.map(row => row.follower_user_id)

  const IdsList = followersUserIds.map(id => `'${id}'`).join(',')

  const getNames = `select name from user where user_id in (${IdsList});`
  const names = await db.all(getNames)
  response.send(names)
})

//api-6

const checkTweetId = async (request, response, next) => {
  const {username} = request
  const getFollowerId = `select user_id from user where username='${username}';`
  const followerIdObj = await db.get(getFollowerId)
  const followerIdnum = followerIdObj.user_id

  const getFollowingIds = `select following_user_id from follower where follower_user_id=${followerIdnum}`
  const idList = await db.all(getFollowingIds)

  const followingUserIds = idList.map(row => row.following_user_id)
  const IdsList = followingUserIds.map(id => `'${id}'`).join(',')
  request.IdsList = IdsList
  request.followerIdnum = followerIdnum
  next()
}

app.get('/tweets/:tweetId/', check, checkTweetId, async (request, response) => {
  const {tweetId} = request.params
  const selecttweetIds = `select tweet_id from tweet where user_id in(${request.IdsList});`
  const tweetIds = await db.all(selecttweetIds)
  const Ids = tweetIds.map(id => id.tweet_id)

  if (Ids.includes(parseInt(tweetId))) {
    const query = `SELECT 
    tweet.tweet, 
    (SELECT COUNT(*) FROM "like" WHERE tweet_id = tweet.tweet_id) AS likes, 
    (SELECT COUNT(*) FROM reply WHERE tweet_id = tweet.tweet_id) AS replies, 
    tweet.date_time AS dateTime
   FROM 
    tweet
   WHERE 
    tweet.tweet_id = ${tweetId};'
    `
    const required = await db.get(query)
    response.send(required)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//api-7

app.get(
  '/tweets/:tweetId/likes/',
  check,
  checkTweetId,
  async (request, response) => {
    const {tweetId} = request.params
    const {IdsList} = request

    // Check if the tweetId is among those from followed users
    const selectTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${request.IdsList});`
    const tweetIds = await db.all(selectTweetIdsQuery)
    const Ids = tweetIds.map(row => row.tweet_id)

    if (Ids.includes(parseInt(tweetId))) {
      // Fetch the names of users who liked the tweet
      const query = `SELECT u.username
                   FROM "like" l
                   JOIN user u ON l.user_id = u.user_id
                   WHERE l.tweet_id = ${tweetId};`
      const required = await db.all(query)
      const names = required.map(row => row.username)
      response.send({likes: names})
    } else {
      response.status(401).send('Invalid Request')
    }
  },
)

//api-8
app.get(
  '/tweets/:tweetId/replies/',
  check,
  checkTweetId,
  async (request, response) => {
    const {tweetId} = request.params
    const selecttweetIds = `select tweet_id from tweet where user_id in(${request.IdsList});`
    const tweetIds = await db.all(selecttweetIds)
    const Ids = tweetIds.map(id => id.tweet_id)

    if (Ids.includes(parseInt(tweetId))) {
      const getrepliesQuery = `select name,reply from user join reply on user.user_id=reply.user_id where 
      tweet_id=${tweetId};`

      const repliesList = await db.all(getrepliesQuery)
      const formattedReplies = {
        replies: repliesList,
      }

      response.send(formattedReplies)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//api-9
app.get('/user/tweets/', check, async (request, response) => {
  const {username} = request

  // Fetch the user ID
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const UserIdObj = await db.get(getUserIdQuery)

  // Directly use the userId from query result
  const userId = UserIdObj.user_id

  // Fetch the user's tweets with likes and replies count
  const tweetsQuery = `
   SELECT
tweet,
(
SELECT COUNT(like_id)
FROM like
WHERE tweet_id=tweet.tweet_id
) AS likes,
(
SELECT COUNT(reply_id)
FROM reply
WHERE tweet_id=tweet.tweet_id
) AS replies,
date_time AS dateTime
FROM tweet
WHERE user_id= ${userId};
  `
  const tweets = await db.all(tweetsQuery)

  response.send(tweets)
})

//api-10
app.post('/user/tweets/', check, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const getUserId = `select user_id from user where username='${username}';`
  const UserIdObj = await db.get(getUserId)
  const userId = UserIdObj.user_id
  const insertTweetQuery = `insert into tweet(tweet,user_id) 
  values(
    '${tweet}',
    ${userId}
  )`
  await db.run(insertTweetQuery)
  response.send('Created a Tweet')
})

//api-11
app.delete('/tweets/:tweetId/', check, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getUserId = `select user_id from user where username='${username}';`
  const UserId = await db.get(getUserId)
  const UserIdNum = UserId.user_id

  const getUserTweetIds = `select tweet_id from tweet where user_id=${UserIdNum};`
  const UserTweets = await db.all(getUserTweetIds)
  const TweetIds = UserTweets.map(id => id.tweet_id)
  const tweetIdsInReq = TweetIds.map(id => `'${id}'`).join(',')

  if (TweetIds.includes(parseInt(tweetId))) {
    const deleteQuery = `delete from tweet where tweet_id in (${tweetId});`
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//login api

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkUser = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(checkUser)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password)
    if (isPasswordCorrect) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

module.exports = app
