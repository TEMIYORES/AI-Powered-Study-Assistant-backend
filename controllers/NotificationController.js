import nodeCron from "node-cron";
import nodemailer from "nodemailer";
import Notification from "../model/Notification.js";
import Account from "../model/Account.js";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";

// Get the current file's URL
const __filename = fileURLToPath(import.meta.url);

// Get the directory name
import { dirname } from "path";
import StudyPlan from "../model/StudyPlan.js";
import StudySession from "../model/StudySession.js";
const __dirname = dirname(__filename);

const getNotifications = async (req, res) => {
  const { email } = req.params;
  if (!email) {
    return res.sendStat(400).json({ message: "Email is required" });
  }
  const notification = await Notification.findOne({ email }).exec();
  if (!notification) {
    return res.sendStatus(204);
  }
  return res.status(200).json(notification.notifications.reverse());
};

function timeToCron(time, dayOfWeek) {
  const [hours, minutes] = time.split(":");
  return `0 ${minutes} ${hours} * * ${dayOfWeek}`;
}
console.log(new Date().getHours(),new Date().getMinutes())
function getCurrentSession(email, studyPlan) {
  studyPlan.week.forEach((day) => {
    const dayOfWeek = day.day;
    day.sessions.forEach((session) => {
      // Schedule start of study session
      nodeCron.schedule(timeToCron(session.startTime, dayOfWeek), () => {
        sendNotification(
          email,
          `It is ${session.startTime}! Start studying ${session.subject} now!`,
          session,
          dayOfWeek,
          "sessionstart",
          "https://careless-swim-nifty-border-production.pipeops.app/dashboard"
        );
      });

      // Schedule end of study session
      nodeCron.schedule(timeToCron(session.endTime, dayOfWeek), () => {
        let currentDate = new Date();
        // Get the current time in milliseconds
        let currentTime = currentDate.getTime();
        // Calculate the time 5 minutes from now (5 minutes * 60 seconds * 1000 milliseconds)
        const dateIn5mins = new Date(currentTime + 5 * 60 * 1000);
        const loggedEndTime = `${dateIn5mins.getHours()}:${dateIn5mins.getMinutes()}`;
        console.log({ loggedEndTime });

        nodeCron.schedule(timeToCron(loggedEndTime, dayOfWeek), async () => {
          const studySessions = await StudySession.findOne({ email }).exec();
          const loggedSession = studySessions.sessions.filter(
            (studysession) => {
              const startDate = new Date();
              const [starttimehour, starttimeminute] =
                session.startTime.split(":");
              startDate.setHours(starttimehour);
              startDate.setMinutes(starttimeminute);
              return (
                studysession.subject === session.subject &&
                studysession.date >= startDate &&
                studysession.date <= new Date()
              );
            }
          );
          if (loggedSession.length === 0) {
            studySessions.missedSessions = [
              ...studySessions.missedSessions,
              {
                subject: session.subject,
                startTime: session.startTime,
                endTime: session.endTime,
                date: new Date(),
              },
            ];
            await studySessions.save();
          }
        });
        sendNotification(
          email,
          `It is ${session.endTime}! End of ${session.subject} study session.`,
          session,
          dayOfWeek,
          "sessionend",
          "https://careless-swim-nifty-border-production.pipeops.app/logsession"
        );
      });

      // Schedule breaks
      session.breaks.forEach((breakTime) => {
        // Schedule start of break
        nodeCron.schedule(timeToCron(breakTime.startTime, dayOfWeek), () => {
          sendNotification(
            email,
            `It is ${breakTime.startTime}! Start your break now during ${session.subject} session.`,
            session,
            dayOfWeek,
            "breaktime",
            ""
          );
        });

        // Schedule end of break
        nodeCron.schedule(timeToCron(breakTime.endTime, dayOfWeek), () => {
          sendNotification(
            email,
            `It is ${breakTime.endTime}! End of break. Continue studying ${session.subject}.`,
            session,
            dayOfWeek,
            "breakend",
            "https://careless-swim-nifty-border-production.pipeops.app/dashboard"
          );
        });
      });
    });
  });
}

const scheduleNotification = async () => {
  try {
    const studyPlans = await StudyPlan.find();
    if (studyPlans) {
      studyPlans.forEach((studyPlan) => {
        getCurrentSession(studyPlan.email, studyPlan.studyPlan);
      });
    }
  } catch (err) {
    console.log(err);
  }
};
scheduleNotification();

const deleteNotifications = async (req, res) => {
  const { email } = req.body;
  const notification = await Notification.findOne({ email }).exec();
  if (!notification) {
    return res.sendStatus(204);
  }
  notification.notifications = [];
  await notification.save();
  return res
    .status(200)
    .json({ message: "Notification deleted successfully!" });
};

const cancelNotification = async (req, res) => {
  const { email } = req.body;
  // const studynotification = schedule.scheduledJobs[email];
  // if (studynotification) {
  //   studynotification.cancel();
  //   return res.status(200).send({ message: "Study notification cancelled" });
  // } else {
  //   return res.status(404).send({ message: "Study notification not found" });
  // }
};

const sendNotification = async (
  email,
  message,
  session,
  dayOfWeek,
  type,
  appLink
) => {
  const accountUser = await Account.findOne({ email }).exec();

  // Fetch user details and send notification
  const recipientEmail = email;
  const subject = message;
  const templateData = {
    name: accountUser.fullName,
    heading: message,
    appLink,
    unsubscribeLink: "",
    type,
  };
  sendMail(recipientEmail, subject, templateData);
  // Example for in-app notification:
  addNotification(email, message);
};

const sendMail = async (to, subject, templateData) => {
  let templatePath;
  if (templateData.type === "sessionstart") {
    templatePath = path.join(__dirname, "..", "views", "sessionstart.ejs");
  } else if (templateData.type === "sessionend") {
    templatePath = path.join(__dirname, "..", "views", "sessionend.ejs");
  } else if (templateData.type === "breaktime") {
    templatePath = path.join(__dirname, "..", "views", "breaktime.ejs");
  } else {
    templatePath = path.join(__dirname, "..", "views", "breakend.ejs");
  }
  // Read the EJS template file
  ejs.renderFile(templatePath, templateData, async (err, data) => {
    if (err) {
      console.log("Error rendering EJS template:", err);
      return;
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // Use `true` for port 465, `false` for all other ports
      auth: {
        user: process.env.USER_EMAIL, //send gmail address
        pass: process.env.USER_PWD, //app password from email account
      },
    });
    const lottieGifPath = path.join(
      __dirname,
      "..",
      "public",
      "img",
      "chatbot.gif"
    );
    // Set up mail options
    const mailOptions = {
      from: {
        name: "AI-Powered Study Assistant",
        address: process.env.USER_EMAIL,
      },
      to: to,
      subject: subject,
      html: data,
      attachments: [
        {
          filename: "Chatbot",
          path: lottieGifPath,
          cid: "lottieGif", // Same CID as used in the email template
        },
      ],
    };

    // Send the email
    await transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email:", error);
      } else {
        console.log("Email sent:", info.response);
      }
    });
  });
};

const addNotification = async (email, message) => {
  const previousNotifications = await Notification.findOne({ email }).exec();
  if (previousNotifications) {
    previousNotifications.notifications = [
      ...previousNotifications.notifications,
      message,
    ];
    await previousNotifications.save();
  } else {
    await Notification.create({
      email,
      notifications: [message],
    });
  }
};
export { cancelNotification, getNotifications, deleteNotifications };
