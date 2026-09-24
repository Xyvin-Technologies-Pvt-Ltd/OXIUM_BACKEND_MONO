const { sendEmail } = require("./emailSender");

const portalUrl = () => process.env.PORTAL_URL || "https://foco.goecm.com.np";

const sendPortalCredentialsMail = async ({ name, email, password, stationName, isReset }) => {
  const subject = isReset
    ? "Your GOEC Station Portal password has been reset"
    : "Your GOEC Station Portal account";
  const intro = isReset
    ? `Your password for the GOEC Station Portal (${stationName}) has been reset by GOEC.`
    : `An account has been created for you on the GOEC Station Portal for ${stationName}.`;

  const text = `Hello ${name},

${intro}

Portal: ${portalUrl()}
Email: ${email}
Temporary password: ${password}

You will be asked to set a new password when you sign in.

Regards,
GOEC Team
`;
  await sendEmail({ to: email, subject, text });
};

const sendPortalOtpMail = async ({ name, email, otp, validMinutes }) => {
  const text = `Hello ${name},

Your GOEC Station Portal password reset code is: ${otp}

The code is valid for ${validMinutes} minutes. If you did not request this, you can ignore this email.

Regards,
GOEC Team
`;
  await sendEmail({ to: email, subject: "GOEC Station Portal password reset code", text });
};

module.exports = { sendPortalCredentialsMail, sendPortalOtpMail };
