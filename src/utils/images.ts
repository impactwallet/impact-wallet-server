const getSharp = async (): Promise<any> => {
  return (await import('sharp')) as any;
};

export const resizeBuffer = async (buffer: Buffer): Promise<Buffer> => {
  const sharp = await getSharp();
  return sharp(buffer)
    .resize(512)
    .toBuffer();
};
