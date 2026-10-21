import { findAppointmentsDueForReminder } from "../model/appointmentModel.js";
import { REMINDER_STEPS, notifyReminder } from "./notifications.js";

// Appointment reminders: 1 day, 1 hour, 30 minutes and 10 minutes before the slot.
//
// The sweep below asks "which reminders are due right now?" rather than "which fire in the next
// minute", so a reminder is still delivered if the server was restarted or busy when its exact
// moment passed - but only inside that step's window, so a late one is dropped instead of telling
// the patient the wrong thing. Sending the same reminder twice is impossible because every
// reminder carries a dedupeKey of type + appointment + scheduled time (see config/notifications.js).

let running = false; // one sweep at a time, even if a slow one overruns the next tick

export const runReminderSweep = async () => {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    for (const step of REMINDER_STEPS) {
      const due = await findAppointmentsDueForReminder(step.minutes, step.windowMinutes);
      for (const appointment of due) {
        // null = this reminder was already sent earlier, so nothing was emailed
        if (await notifyReminder({ appointment, step })) sent++;
      }
    }
  } catch (error) {
    console.log(`Reminder sweep error ${error.message}`);
  } finally {
    running = false;
  }
  return sent;
};

// Called once from index.js after the database is connected.
export const startReminderScheduler = (everyMinutes = 1) => {
  const tick = () =>
    runReminderSweep()
      .then((sent) => sent && console.log(`Sent ${sent} appointment reminder(s)`))
      .catch((error) => console.log(`Reminder scheduler error ${error.message}`));
  tick();
  const timer = setInterval(tick, everyMinutes * 60 * 1000);
  timer.unref?.(); // never hold the process open just for the scheduler
  return timer;
};
