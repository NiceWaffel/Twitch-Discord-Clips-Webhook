import { WebhookClient } from "discord.js";
import * as DotEnv from "dotenv";

DotEnv.config();

const token = await fetch(
  `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
  {
    method: "POST",
  },
).then((res) => res.json());
const access_token = token.access_token;
const expires_in = token.expires_in;
const broadcaster = await fetch(
  `https://api.twitch.tv/helix/users?login=${process.env.BROADCASTER_LOGIN}`,
  {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${access_token}`,
    },
  },
).then((res) => res.json());
if (!broadcaster.data) {
  console.error(
    `Error retrieving broadcaster info. Response from Twitch: ${JSON.stringify(
      broadcaster,
    )}`,
  );
  //process.exit(77); // EX_NOPERM
  process.exit(78); // EX_CONFIG
}
const broadcasterId = broadcaster.data[0].id;
const broadcasterDisplayName = broadcaster.data[0].display_name;
const pollingInterval = process.env.POLLING_INTERVAL ?? "1d";
const pollingIntervalNumber = parseInt(
  pollingInterval.substring(0, pollingInterval.length - 1),
);
let date = new Date();
switch (pollingInterval.substring(pollingInterval.length - 1)) {
  case "d": // days
    date.setDate(date.getDate() - pollingIntervalNumber);
    break;
  case "M": // months
    date.setMonth(date.getMonth() - pollingIntervalNumber);
    break;
  case "y": // years
    date.setFullYear(date.getFullYear() - pollingIntervalNumber);
    break;
  case "h": // hours
    date.setHours(date.getHours() - pollingIntervalNumber);
    break;
  case "m": // minutes
    date.setMinutes(date.getMinutes() - pollingIntervalNumber);
    break;
  case "s": // seconds
    date.setSeconds(date.getSeconds() - pollingIntervalNumber);
    break;
  default: // else
    console.error(
      `Only d (days), M (months), y (years), h (hours), m (minutes) and s (seconds) are allowed! You used ${pollingInterval.substring(
        pollingInterval.length - 1,
      )}`,
    );
    process.exit(78); // EX_CONFIG
    break;
}
const clips = (
  await fetch(
    `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100&started_at=${date.toISOString()}`,
    {
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${access_token}`,
      },
    },
  ).then((res) => res.json())
).data;
console.log(JSON.stringify(clips));
let creatorIds = [];
let videoIds = [];
if (clips.length < 1) process.exit(); // No clips to post
for (let i = 0; i < clips.length; i++) {
  creatorIds.push(clips[i].creator_id);
  if (clips[i].video_id.length > 0) {
    videoIds.push(clips[i].video_id);
  }
}
creatorIds = [...new Set(creatorIds)]; // Remove duplicate entries
let usersQuery;
let profileImageUrls = [];
if (creatorIds.length > 0 && creatorIds.length <= 100) {
  usersQuery = "?id=" + creatorIds.join("&id=");
  profileImageUrls = (
    await fetch(`https://api.twitch.tv/helix/users${usersQuery}`, {
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${access_token}`,
      },
    }).then((res) => res.json())
  ).data.map((x) => {
    return {
      id: x.id,
      profileImageUrl: x.profile_image_url,
    };
  });
} else if (creatorIds.length > 100) {
  console.error("More than 100 users to look up");
}
let videosQuery;
let videoTitles = [];
if (videoIds.length > 0 && videoIds.length <= 100) {
  videosQuery = "?id=" + videoIds.join("&id=");
  videoTitles = (
    await fetch(`https://api.twitch.tv/helix/videos${videosQuery}`, {
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${access_token}`,
      },
    })
      .then((res) => res.json())
      .catch((err) => console.error(err))
  ).data.map((x) => {
    return {
      id: x.id,
      title: x.title,
    };
  });
} else if (videoIds.length > 100) {
  console.error("More than 100 videos to look up");
}
const webhookClient = new WebhookClient({
  url: process.env.DISCORD_WEBHOOK_URL,
});
for (let i = 0; i < clips.length; i++) {
  if (process.env.SUPPRESS_UNTITLED == "true") {
    let video = videoTitles.find((x) => x.id == clips[i].video_id);
    if (video && video.title == clips[i].title) continue;
  }
  let content = `\`\`${clips[i].title.trim()}\`\`: ${clips[i].url}`;
  if (process.env.SHOW_CREATED_DATE == "true") {
    let time = new Date(clips[i].created_at).getTime() / 1000;
    content += ` (Created at: <t:${time}:F> - <t:${time}:R>)`;
  }
  await webhookClient
    .send({
      username: clips[i].creator_name.trim(),
      avatarURL: profileImageUrls.find((x) => x.id == clips[i].creator_id)
        ?.profileImageUrl,
      content,
    })
    .catch((err) => console.error);
}
