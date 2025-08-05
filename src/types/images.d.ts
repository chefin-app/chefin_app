declare module '*.jpg' {
  const content: number; // for Expo and React Native, images resolve to numbers
  export default content;
}

declare module '*.png' {
  const content: number;
  export default content;
}

declare module '*.jpeg' {
  const content: number;
  export default content;
}
