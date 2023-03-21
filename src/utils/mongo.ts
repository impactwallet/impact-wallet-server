import mongoose from 'mongoose';

export const areObjectIdsEqual = (oid1: any, oid2: any) => {
  return new mongoose.Types.ObjectId(oid1).equals(oid2);
};