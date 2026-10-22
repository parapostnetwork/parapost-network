import { supabase } from '@/lib/supabase';
import { groupsFetch, groupAction, groupUpload } from './client';
export type GroupsTransport = {
  getUser: () => Promise<string>;
  subscribe: (callback:(id:string)=>void) => () => void;
  read: typeof groupsFetch;
  action: typeof groupAction;
  upload: typeof groupUpload;
};
export const liveGroupsTransport: GroupsTransport = {
  getUser: async () => (await supabase.auth.getUser()).data.user?.id ?? '',
  subscribe: callback => {
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>callback(session?.user.id ?? ''));
    return () => subscription.unsubscribe();
  },
  read:groupsFetch,action:groupAction,upload:groupUpload,
};
