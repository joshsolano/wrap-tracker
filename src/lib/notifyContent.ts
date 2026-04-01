import { supabase } from './supabase'

export async function notifyContent(params: {
  projectName: string
  type: 'before' | 'after'
}) {
  const { data, error } = await supabase.functions.invoke('notify-content', {
    body: { projectName: params.projectName, type: params.type },
  })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error }
  return { error: null }
}
