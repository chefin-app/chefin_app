import { View, Text } from 'react-native';
import React from 'react';
import { supabase } from '../services/supabase';

export const fetchTestData = async () => {
  const request = supabase.from('listings').select('count', { count: 'exact', head: true });
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }
  console.log('Total listings:', data);
  return data ?? 0;
};
