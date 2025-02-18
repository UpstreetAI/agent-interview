const textEncoder = new TextEncoder();

export const bytesToDataUrl = (bytes, type = 'application/octet-stream') => {
  // manually build the string instead of using .reduce
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }

  // encode the binary string
  const base64String = btoa(binaryString);
  const s = `data:${type};base64,${base64String}`;
  return s;
};
export const arrayBufferToDataUrl = (arrayBuffer, type = 'application/octet-stream') => {
  const bytes = new Uint8Array(arrayBuffer);
  return bytesToDataUrl(bytes, type);
};
export const stringToDataUrl = (str, type = 'text/plain') => {
  const bytes = textEncoder.encode(str);
  return bytesToDataUrl(bytes, type);
};
export const blobToDataUrl = async (blob) => {
	const arrayBuffer = await blob.arrayBuffer();
  return arrayBufferToDataUrl(arrayBuffer, blob.type);
};
export const base64toBlob = (url, content_type) => {
  try {
    const base64Data = url.substring(url.indexOf(',') + 1);
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: content_type });
    return blob;
  } catch (error) {
    throw new Error("base64toBlob | error: ", error);
  }
};