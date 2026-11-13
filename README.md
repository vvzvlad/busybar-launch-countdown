# Launch Countdown

A countdown to the next rocket launch anywhere in the world.

A JavaScript app for [BUSY Bar](https://busy.app). Work in progress.

## What it does

- The front display shows a rocket, the countdown to liftoff such as `T-02:13:44`, and the mission name scrolling by.
- The color follows the launch status: Go, TBC, TBD or Hold.
- The wheel steps through the next five launches.
- At T-0 a liftoff animation plays with a sound.

## Data

[The Space Devs Launch Library 2](https://thespacedevs.com/llapi), no key needed, polled every 15 minutes.

## Build

Node 24 and npm:

```sh
npm ci
npm run build         # dist/io.github.vvzvlad.launches.tgz
npm run app:install   # install it on a BUSY Bar connected over USB
npm run app:run       # start it
```

## License

[MIT](LICENSE)
