# Launch Countdown

A countdown to the next rocket launch anywhere in the world.

A JavaScript app for [BUSY Bar](https://busy.app). Work in progress.

## What it does

- The front display shows a rocket on its launch pad and the countdown to liftoff in large digits, such as `02:13:44`, or `3D 07H` when it is more than a day away.
- The back display shows the mission name, its status, the launch date and time on the BUSY Bar's clock, and which of the five launches it is, such as `1/5`.
- The color follows the launch status: Go, TBC, TBD or Hold.
- The wheel steps through the next five launches.
- At T-0 the rocket lifts off the pad on its flame and flies off the top, and the next launch takes its place.

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
