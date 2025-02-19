export const bytesToBase64 = (uint8Array) => {
  // manually build the string instead of using .reduce
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  // encode the binary string
  const base64String = btoa(binaryString);
  return base64String;
};

export const bytesToDataUrl = (uint8Array, type = 'application/octet-stream') => {
  const base64String = bytesToBase64(uint8Array);
  return `data:${type};base64,${base64String}`;
};
export const stringToDataUrl = (str, type = 'text/plain') => {
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(str);
  return bytesToDataUrl(bytes, type);
};
export const blobToDataUrl = async (blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return bytesToDataUrl(uint8Array, blob.type);
};

export const base64ToBytes = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};
export const base64toBlob = (base64, type) => {
  const uint8Array = base64ToBytes(base64);
  const blob = new Blob([uint8Array], { type });
  return blob;
};