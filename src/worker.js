export default {
  async email(message, env, ctx) {
    const allowList = ["friend@example.com", "coworker@example.com"];
    if (!allowList.includes(message.from)) {
      message.setReject("Address not allowed");  
      return;
    }
    await message.forward("inbox@corp");
  }
}