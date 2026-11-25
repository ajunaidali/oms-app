import type { RefObject } from 'react';
import {
  Dimensions,
  findNodeHandle,
  Keyboard,
  Platform,
  type ScrollView,
  type TextInput,
} from 'react-native';

/** Pixels of content to keep visible below the focused field (e.g. submit button). */
export type ScrollToKeyboardOptions = {
  extraOffset?: number;
  animated?: boolean;
  retries?: number;
};

function scrollNativeHandleToKeyboard(
  scrollRef: ScrollView | null,
  input: TextInput | null | undefined,
  extraOffset: number,
  animated: boolean,
) {
  if (!scrollRef || !input) {
    scrollRef?.scrollToEnd({ animated });
    return false;
  }
  const handle = findNodeHandle(input);
  if (!handle) {
    scrollRef.scrollToEnd({ animated });
    return false;
  }
  const responder = scrollRef.getScrollResponder?.() as
    | {
        scrollResponderScrollNativeHandleToKeyboard?: (
          nodeHandle: number,
          additionalOffset?: number,
          preventNegativeScrollOffset?: boolean,
        ) => void;
      }
    | undefined;
  if (responder?.scrollResponderScrollNativeHandleToKeyboard) {
    responder.scrollResponderScrollNativeHandleToKeyboard(handle, extraOffset, true);
    return true;
  }
  scrollRef.scrollToEnd({ animated });
  return false;
}

function scrollWithMeasureInWindow(
  scrollRef: ScrollView | null,
  input: TextInput | null | undefined,
  extraOffset: number,
  animated: boolean,
) {
  if (!scrollRef || !input) {
    scrollRef?.scrollToEnd({ animated });
    return;
  }
  const keyboardHeight = readKeyboardHeight();
  const windowHeight = Dimensions.get('window').height;
  const visibleBottom = windowHeight - keyboardHeight - extraOffset;
  input.measureInWindow((_x, inputY, _width, inputHeight) => {
    if (inputY + inputHeight <= visibleBottom) {
      return;
    }
    scrollRef.scrollToEnd({ animated });
  });
}

/** Scroll a ScrollView so `input` and optional content below it stay above the IME. */
export function scrollInputAboveKeyboard(
  scrollRef: RefObject<ScrollView | null>,
  input: TextInput | null | undefined,
  options: ScrollToKeyboardOptions = {},
) {
  const { extraOffset = 72, animated = true, retries = Platform.OS === 'android' ? 3 : 1 } = options;
  const delayMs = Platform.OS === 'android' ? 100 : 50;

  const run = (attempt: number) => {
    const usedNative = scrollNativeHandleToKeyboard(scrollRef.current, input, extraOffset, animated);
    if (!usedNative) {
      scrollWithMeasureInWindow(scrollRef.current, input, extraOffset, animated);
    }
    if (attempt + 1 < retries) {
      setTimeout(() => run(attempt + 1), delayMs * (attempt + 1));
    }
  };

  requestAnimationFrame(() => {
    setTimeout(() => run(0), Platform.OS === 'android' ? 50 : 0);
  });
}

export function readKeyboardHeight(fallback = 0): number {
  const metrics = Keyboard.metrics?.();
  return metrics?.height || fallback;
}