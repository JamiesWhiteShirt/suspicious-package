/**
 * Pads the string with a given string (possibly repeated) so that the resulting string reaches a given length.
 * The padding is applied from the start (left) of the string.
 * 
 * @param str {string} The string to pad.
 *
 * @param maxLength {number} The length of the resulting string once the current string has been padded.
 *        If this parameter is smaller than the current string's length, the current string will be returned as it is.
 *
 * @param fillString {string=} The string to pad the string with.
 *        If this string is too long, it will be truncated and the left-most part will be applied.
 *        The default value for this parameter is " " (U+0020).
 * @return {string}
 */
module.exports = function leftPad(str, maxLength, fillString) {
  return str.padStart(maxLength, fillString)
};
