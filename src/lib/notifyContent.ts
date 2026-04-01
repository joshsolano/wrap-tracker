import { supabase } from './supabase'

export async function notifyContent(params: {
  projectName: string
  type: 'before' | 'after'
}) {
  const { error } = await supabase.functions.invoke('notify-content', {
    body: { projectName: params.projectName, type: params.type },
  })
  return { error: error?.message ?? null }
}
