import { finalizeMeeting, recoverLastMeeting, pickupLastMeeting } from '../background/meeting-storage'

export const MeetingService = {
  finalizeMeeting: (): Promise<string> => finalizeMeeting(),
  recoverMeeting: (): Promise<string> => recoverLastMeeting(),
  pickupLastMeeting: (): Promise<string> => pickupLastMeeting(),
}
