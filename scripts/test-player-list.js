const API_KEY = process.env.DATAGOLF_API_KEY;

const url = `https://feeds.datagolf.com/get-player-list?file_format=[ file_format ]&key=a2fae06af6b6c02f572816986fdf`;

fetch(url)
  .then((res) => res.json())
  .then((data) => {
    console.log(JSON.stringify(data.slice ? data.slice(0, 20) : data, null, 2));
  });
