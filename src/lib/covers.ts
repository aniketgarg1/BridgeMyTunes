/** A song whose album cover floats around the home page's paste bar. Clicking it drops the song's link in the bar. */
export interface CoverSong {
  name: string;
  artist: string;
  url: string;
  art: string;
}

/*
 * A fixed set of well-known albums whose covers are artwork, not photos of people, so the home page always looks
 * the same and nothing unexpected shows up (a daily chart would). Links and artwork are Apple Music's own.
 * The first eight also show on phones.
 */
export const HOME_COVERS: CoverSong[] = [
  { name: "New Person, Same Old Mistakes", artist: "Tame Impala", url: "https://music.apple.com/us/album/new-person-same-old-mistakes/1440838039?i=1440838708", art: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a8/2e/b4/a82eb490-f30a-a321-461a-0383c88fec95/15UMGIM23316.rgb.jpg/300x300bb.jpg" },
  { name: "Do I Wanna Know?", artist: "Arctic Monkeys", url: "https://music.apple.com/us/album/do-i-wanna-know/663097964?i=663097965", art: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/69/9c/b5/699cb5d6-115c-ff73-9d26-e57ea4350d72/887828031795.png/300x300bb.jpg" },
  { name: "Otro Atardecer", artist: "Bad Bunny & The Mar\u00edas", url: "https://music.apple.com/us/album/otro-atardecer/1622045624?i=1622046222", art: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/300x300bb.jpg" },
  { name: "Bohemian Rhapsody", artist: "Queen", url: "https://music.apple.com/us/album/bohemian-rhapsody/6781024026?i=6781024437", art: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8b/0a/ea/8b0aea60-6f4a-195b-5958-cdf459c2333b/602527644271.jpg/300x300bb.jpg" },
  { name: "Weird Fishes / Arpeggi", artist: "Radiohead", url: "https://music.apple.com/us/album/weird-fishes-arpeggi/1109714933?i=1109715168", art: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/dd/50/c7/dd50c790-99ac-d3d0-5ab8-e3891fb8fd52/634904032463.png/300x300bb.jpg" },
  { name: "One More Time", artist: "Daft Punk", url: "https://music.apple.com/us/album/one-more-time/697194953?i=697195462", art: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/300x300bb.jpg" },
  { name: "Yellow", artist: "Coldplay", url: "https://music.apple.com/us/album/yellow/1122782080?i=1122782283", art: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f5/93/8c/f5938c49-964c-31d1-4b33-78b634f71fb7/190295978075.jpg/300x300bb.jpg" },
  { name: "Stronger", artist: "Kanye West", url: "https://music.apple.com/us/album/stronger/1442845779?i=1442846328", art: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/39/25/2d/39252d65-2d50-b991-0962-f7a98a761271/00602517483507.rgb.jpg/300x300bb.jpg" },
  { name: "Get Lucky", artist: "Daft Punk, Pharrell Williams & Nile Rodgers", url: "https://music.apple.com/us/album/get-lucky/617154241?i=617154366", art: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/300x300bb.jpg" },
  { name: "Everything In Its Right Place", artist: "Radiohead", url: "https://music.apple.com/us/album/everything-in-its-right-place/1097862870?i=1097863108", art: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/bd/8e/13/bd8e1358-b367-a689-cb84-cebd0b067dc4/634904078263.png/300x300bb.jpg" },
];
