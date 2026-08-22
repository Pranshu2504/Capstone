import { Dimensions, Platform } from 'react-native';

/**
 * Screen dimensions, corrected for the web build.
 *
 * On web the app renders inside a centred phone frame (see `--zora-app-max-width`
 * in index.html), but `Dimensions.get('window')` reports the whole browser
 * viewport. Any layout computed from the raw value — `(width - 48) / 2` card
 * grids, `width * 0.82` panels — is sized to the desktop window and overflows
 * past the frame's clipped edge. Every screen should measure against these.
 */

/** Keep in sync with `--zora-app-max-width` in index.html. */
export const APP_FRAME_WIDTH = 460;

const window = Dimensions.get('window');

export const SCREEN_WIDTH =
  Platform.OS === 'web' ? Math.min(window.width, APP_FRAME_WIDTH) : window.width;

export const SCREEN_HEIGHT = window.height;

/**
 * Vertical room a scrolling screen must leave at the bottom.
 *
 * The "Ask ZORA" button floats above the tab bar rather than scrolling with
 * the content, so anything padded less than its top edge ends up underneath
 * it — which is what buried "no bottoms yet" and the calendar's last event.
 * Measured from the button's own offset and height, plus a little breathing
 * room, so raising the button means changing this once.
 */
export const FLOATING_CTA_CLEARANCE = 180;
