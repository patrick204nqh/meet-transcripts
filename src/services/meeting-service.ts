import { processLastMeeting, recoverLastMeeting, pickupLastMeetingFromStorage } from '../background/meeting-storage'

export const MeetingService = {
  finalizeMeeting: (): Promise<string> => processLastMeeting(),
  recoverMeeting: (): Promise<string> => recoverLastMeeting(),
  pickupFromStorage: (): Promise<string> => pickupLastMeetingFromStorage(),
}
