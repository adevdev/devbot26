# wachan
Simpler way to code baileys.

## Deprecation Warning
In the next major version, all response functions (including the ones for commands) will have their parameters simplified into 2:
- `context` - This will contain: `message`, `captures`, `group` and `command`
- `next` function

More explanation [here](#response-function)

## Contents
- [Installation](#installation)
- [Example](#example)
- [Settings File](#settings-file)
    - [Default Settings](#default-settings)
    - [Explanation](#explanation-on-each-item)
- [Bot Object](#bot-object)
- [Response Function](#response-function)
    - [Message Object](#message-object)
    - [Captures](#captures)
    - [Returned Value](#returned-value)
- [Message Sending Options](#message-sending-options)
    - [Mentioning](#mentioning)
    - [Group Data](#group-data)
- [Receiver Flow](#receiver-flow)
- [Message Type Enums](#message-type-enums)
- [Tools](#tools)
    - [Commands](#commands-tool-requirewachancommands)
    - [Sticker](#sticker-tool-requirewachansticker)
- [Custom Functionality](#custom-functionality)
- [Changelog](#changelog)

## Installation
```bash
npm install wachan
```

## Example
4 types of inputs:
```javascript
const bot = require("wachan")

// 1) String Input: Respond to messages that have the exact text.
bot.onReceive("Hello", "Hi")

// 2) Regex Input: Respond to messages that have the pattern in the text.
bot.onReceive(/good (morning|afternoon|evening)/i, "to you as well")

// 3) Function Input: Respond to messages if the function returns true
bot.onReceive((msg)=>msg.sender.id===OWNER_ID, "hello boss")

// 4) Enum Input: 
bot.onReceive(bot.messageType.audio, "Received audio message")
```

3 Types of responses:
```js
// 1) String response: Text message
bot.onReceive("Marco", "Polo")

// 2) Object response: More sending options
bot.onReceive("send image", {image:"buffer, url, or path", caption:"This is the caption"})
bot.onReceive("send video", {video:"...", caption:"..."})
bot.onReceive("send gif", {gif:"...", caption:"..."}) // must send a video file for it to animate as whatsapp does not support gif files
bot.onReceive("send audio", {audio:"..."})
bot.onReceive("send sticker", {sticker:"..."}) // webp file

// 3) Function response: Custom actions
bot.onReceive("test", async (context, next) => {
    // v1 arguments: message, captures, group, next

    const { message, captures, group } = context
    const options = {...}

    // 3 ways of sending message:
    // 1) Using bot.sendMessage()
    await bot.sendMessage(TARGET_ID, "string for text message")
    await bot.sendMessage(TARGET_ID, options) // more sending options

    // 2) Using message.reply()
    await message.reply("string for text message")
    await message.reply(options) // more sending options

    // 3) Returning a value (equivalent to message.reply)
    return "string for text message"
    return options // more sending options
})
```

Other events:
```js
// When wachan succesfully connected (processed before offline messages)
bot.onConnected(async () => {
    await bot.sendText(targetId, "Wachan is connected!")
})

// When wachan is ready (processed after offline messages)
bot.onReady(async () => {
    await bot.sendText(targetId, "Finished reading all unread messages!")
})
```

Starting the bot:
```js
bot.start()
```

## Settings File
### Default Settings
When first run, a default settings file is created if it's not there.
```json
{
  "receiveOfflineMessages": true,
  "defaultBotName": "Wachan",
  "messageStoreSize": 1000
}
```
These settings can be altered in the meantime by accessing `bot.settings`. To save the changes so that it will take effect next run, use `bot.settings.save()`.
#### Explanation on each item:
- `receiveOfflineMessages`: If set to `true`, will allow messages received when offline to be processed by `bot.onReceive`.
- `defaultBotName`: Will use this name if bot's own message doesn't have `message.sender.name`
- `messageStoreSize`: The size limit of the Message Store. This store is used internally to fix some bugs.

## Bot Object
This is what wachan module exports:<br><br>
`bot`: Wachan bot object
- `bot.onConnected(callback)` - Set up the action to be taken when wachan is succesfully connected to whatsapp, <b>before</b> processing offline messages.
- `bot.onReady(callback)` - Set up the action to be taken <b>after</b> processing offline messages.
- `bot.onReceive(input, response)` - Set up a receiver that responds to incoming messages of specified input.
    - `input`: can be a string, regex, function, or enum.
        - string: will match the exact string of the message text
        - regex: will match the pattern of the message text
        - function, `input(message)`: will filter the message based on the return value
        - enum: check `bot.messageType` for available enums:
            - `any`, `nonmedia`, `media`, `text`, `reaction`, `image`, `video`, `gif`, `audio`, `sticker`, `document`
    - `response`: can be a string, an object, or a function.
        - string: will reply to (and quote) the received message with the string as the text
        - object: will reply to (and quote) the received message using data from the object. See [here](#message-sending-options)
        - function: `response(context, next)`, will execute the function. [Explanation here](#response-function)
    - returns: a `Receiver` object. This Receiver can be removed to stop its behavior by calling `receiver.remove()`
- `bot.onReceiveReply(message, response)` - Set up a receiver that responds to incoming messages as a reply to a specific message, or to any messages if first parameter is set to falsy.
- `bot.onError(response)` - Set up a new action to be taken in response of an error.
    - `response` - A function to run, `response(error, context)`.
        - `error` - The error object.
        - `context` - An object, containing the arguments from the response function:
            - `message`
            - `captures`
            - `group` (previously `groupChat`)
- `bot.waitForMessage(input, timeout)` - Wait for a message of specified input then return the message
    - `input`: The same as `input` in `bot.onReceive()` above
    - `timeout`: Time limit for the waiting. If no matching messages have been captured, `waitForMessage()` returns `undefined`
- `bot.sendMessage(targetId, options)` - Send a message
    - `targetId` - the ID of the chatroom to send to
    - `options` - can be a string / object
        - string: send a text message
        - object: can send a message with more options. See [here](#message-sending-options)
- `bot.showTyping(targetId)` - Show the "typing" state to a chat id
- `bot.showRecording(targetId)` - Show the "recording" state to a chat id
- `bot.getGroupData(jid)` - Get data of a group chat by its ID.
- `bot.getUserData(id)` - Get data of a user by JID / LID, if the bot has saved it.
- `bot.getBotData()` - Get data of the bot (id, lid, name)
- `bot.start(options)` - Start the bot. Options:
    - `suppressBaileysLogs`: Default `true`. If `true`, do not show logs from baileys in the console.
    - `phoneNumber`: String containing the phone number (with country code, without symbols and spaces). If not specified, wachan will prompt it in the console.
    - `configOverrides`: An object of config to override bailey's makeWASocket function parameters
- `bot.settings` - Settings for the bot. See [here](#explanation-on-each-item)
    - `bot.settings.receiveOfflineMessages`
    - `bot.settings.defaultBotName`
    - `bot.settings.save()` - Save the settings. Do this after modifying the settings programmatically.
- `bot.getSocket()` - Get the original baileys' socket object.
- `bot.messageType` - Contains enums for receiver input. See [here](#message-type-enums)

## Response Function
You can use a function as the response to a message. The first argument is `context` and the second one is `next` function (check out [Receiver Flow](#receiver-flow)).
<br><br>Previously, the first argument is `message`, the second argument is `captures` (if available), the third is `group` (if the chatroom is a group chat), and the last is `next` function. (This is now deprecated. `message`, `captures`, and `group` will later be under `context` object).

```js
bot.onReceive("test", async function (context, next) {
    // const { message, captures, group } = context
})
```
### Message Object
`message`: Wachan message object
- `message.id` - ID of the message
- `message.room` - ID of the chat room
- `message.isPrivate` - If the message is a private message
- `message.sender` - Sender object
    - `message.sender.id` - ID of the sender (in the format of `phonenumber@s.whatsapp.net`)
    - `message.sender.lid` - LID of the sender (a hidden id  of each Whatsapp user, in the format of `randomnumber@lid`)
    - `message.sender.isMe` - `true` if the sender is the bot itself
    - `message.sender.name` - Username of the sender.
    - `message.sender.isAdmin` - `true`/`false` if the sender is an admin/not an admin of this group chat. `null` if this message is a private message. (not in a group)
- `message.timestamp` - UNIX timestamp of this message.
- `message.type` - Type of this message. Can be one of these: `"text"`, `"image"`, `"video"`, `"gif"`, `"audio"`, `"vn"`, `"sticker"`, `"document"`, `"reaction"`, `"buttons"`, `"buttonReply"`, `"contacts"`, `"poll"`, `"vote"`
- `message.isMedia` - `true` if this is a media message (type = `"image"`, `"video"`, `"gif"`, `"audio"`, `"vn"`, `"sticker"`, or `"document"`)
- `message.downloadMedia(saveTo)` - Get the buffer of the media. If you provide a path in `saveTo`, it will also save the file there.
- `message.streamMedia()` - Get the stream object from the media.
- `message.mimeType` - Mimetype for media messages.
- `message.fileName` - File name for document messages.
- `message.fileSize` - File size for media messages. (in bytes)
- `message.duration` - Duration for audio and video messages (in seconds)
- `message.width` - Width of video
- `message.height` - Height of video
- `message.text` - Text or caption of the message.
- `message.reaction` - Information about reaction, if this is a reaction message
    - `message.reaction.emoji` - The emoji that is used as reaction
    - `message.reaction.key` - Key object of the reacted message
- `message.buttons` - Buttons object. The same as the `buttons` parameter used to send buttons message. ([here](#message-sending-options))
- `message.title` - Title of the buttons message
- `message.footer` - Footer text of the buttons message
- `message.buttonReply` - Information about tapped button
    - `message.buttonReply.id` - The ID that is assigned to the button
    - `message.buttonReply.text` - The displayed text on the button
    - `message.buttonReply.pos` - The position of the button (first one is 0)
- `message.contacts` - List of contacts, if this is a contacts message.
    - `contact.name` - Name of the contact
    - `contact.number` - Phone number of the contact
- `message.poll` - Information on poll, if this is a poll message.
    - `message.poll.title` - Title of the poll
    - `message.poll.options` - Array containing the options.
    - `message.poll.multiple` - True if multiple selection is allowed
    - `message.poll.votes` - An object containing options as keys, and array of voter ids as value. Example: `{"opt1":["1234@lid"]}`
- `message.vote` - An update on polling (the sender voting/unvoting)
    - `message.vote.pollId` - ID of the poll message
    - `message.vote.list` - Array of the selected options. Can also be empty as a result of unvoting.
- `message.receivedOnline` - `true` if this message is received when bot is online.
- `message.edited` - If this message is an edited message
    - `message.edited.type` - The type of the edited message
    - `message.edited.text` - The text of the message after edited
- `message.reply(options)` - Reply to the message.
    - `options` - Can be a string / object
        - string: reply with this text
        - object: can use more options. See [here](#message-sending-options)
- `message.edit(newText)` - Edit the text of a message (only for bot's own messages, and only if the message is still editable, which is within 15 minutes after being sent)
- `message.react(emoji)` - Send reaction to the message.
    - `emoji` - The emoji in string to use as reaction. Use empty string to remove a reaction.
- `message.delete()` - Delete this message. Note: the bot needs to be an admin for it to be able to delete messages in a group.
- `message.getQuoted()` - Return the message that this message is quoting. `null` if there isn't.
- `message.toBaileys()` - Return the original baileys message object.

### Captures
`captures` is an object <b>(not an array)</b> of captured text from regex inputs.

The keys depend on the regex. If using regular capturing using brackets, then the result is stored with numeric keys (starting from 0). If using <i>named capture</i>, then the key is a string.

Input Regex|Received message text|`captures`
-|-|-
`/My name is (\S+)\. I live in (\S+)\./` | `"My name is Wachan. I live in NPM."` | `{"0":"Wachan", "1":"NPM"}`
`/My name is (?<name>\S+)\. I live in (?<location>\S+)\./` | `"My name is Wachan. I live in NPM."` | `{"name":"Wachan", "location":"NPM"}`
<hr>

`captures.toArray()` returns the array of the captures. Useful for doing array operations on it.

### Group
The third argument is `group`, the object that contains information about the group. This will be `null` if the message is sent in a private chat. (Now deprecated as function response's third argument, and it will go inside `context` object).
You can also use `bot.getGroupData(id)` to get information about other groups.

### Returned Value
In the response function, you can return a string/object:
- string: Reply to the received message with this text.<br>Example:
```js
bot.onReceive("test", async () => {
    const a = "bro"
    return `Hello, ${a}!`
})

bot.onReceive("test", async ({msg}) => `Hello, ${msg.sender.name}!`)
```
- object: Can use more options.<br>Example:
```js
bot.onReceive("test", async () => {
    return {text: "Text"}
})

```
## Message Sending Options
In conclusion, there are 4 methods to send a message:
1. Using `bot.sendMessage(targetId, options)`
2. Using an object in the second parameter of `bot.onReceive(input, response)`, which is the `response`.
3. Using `message.reply(options)`
4. Returning an object inside a response function

If the object is a string, then the message will be sent as a text message. However, if it's an object with properties, then it should support these options in the object:
- `options` - The message sending options
    - `options.text` - Text/caption to be sent
    - `options.quoted` - Message to be quoted. By default it's the received message (if using method 2, 3, 4). Can be changed or set to `null`.
    - `options.image` - Image to send. It can be a buffer, a url, a path or a stream object.
    - `options.video` - Video to send. It can be a buffer, a url, a path or a stream object.
    - `options.gif` - Video to send as gif. It can be a buffer, a url, a path or a stream object. (Whatsapp does not actually support GIF files. If you send a GIF file, it won't animate)
    - `options.audio` - Audio to send. It can be a buffer, a url, a path or a stream object.
    - `options.vn` - Audio to send as voice note.
    - `options.sticker` - WebP file to send as sticker (buffer/url/path/stream)
    - `options.document` - A file to send as document. Supporting properties:
        - `options.mimetype` - Mimetype for this document/file
        - `options.fileName` - Filename for this document/file
    - `options.buttons[]` - An array of buttons. Each one has these properties below.
        - `button.type` - The type of the button: `reply`, `list`, `url`, `copy`, `call`.
        - `button.text` - The displayed text on the button. This is required for `reply`, `url`, `copy`, and `call` buttons.
        - `button.id` - ID of the button. Required for `reply` buttons.
        - `button.url` - URL to visit when the button is tapped. Required for `url` buttons.
        - `button.code` - The code to copy to clipboard when the button is tapped. Required for `copy` buttons.
        - `button.phoneNumber` - The number to dial when tapping the button. Required for `call` buttons.
        - `button.title` - Title of the list menu. Required for `list` buttons.
        - `button.sections[]` - Array of list menu sections. Required for `list` buttons. Each item is a `section`:
            - `section.title` - Title of the section
            - `section.rows[]` - List of items in the section. Required in a section. Each item is a `row`:
                - `row.id` - ID of the item on this row. Required.
                - `row.title` - Title of the item on this row. Required.
                - `row.description` - Description of the item.
                - `row.header` - Header text of the item.
    - `options.title` - Title for messages with buttons.
    - `options.footer` - Footer for messages with buttons.
    - `options.contacts[]` - Array of contacts to send. Each item is a `contact`:
        - `contact.name` - The displayed name of the contact.
        - `contact.number` - The contact number (in string)
    - `options.poll` - Poll object to send as poll message
        - `options.poll.title` - Title of the poll
        - `options.poll.options[]` - Options for the poll as array of strings
        - `options.poll.multiple` - If true, then allow multiple selection

<b>Note:</b> Since `bot.sendMessage()` and `message.reply()` return a message object which contains a `text` property, returning the result of these functions inside a response function can make your bot send message twice. For example:
```js
bot.onReceive("test", async (msg) => {
    // this will send 2 messages
    // 1. from the effect of the msg.reply()
    // 2. from returning the resulting message object created by msg.reply()
    return await msg.reply("ok")
})
```

### Mentioning
To mention a user, you can put `@<user-lid>` in your text (without `@lid` part). For example: `msg.reply("Hello @1234567812345")`

### Group Data
To get data of a group chat, use `bot.getGroupData(id)`. Returns, if available:
- `group`
    - `group.id` - ID of the group
    - `group.subject` - The subject / title of the group chat
    - `group.description` - The description of the group
    - `group.getParticipants()` - Get the list of all participants in the group. It's an array of object with the structure:
        - `participant`
            - `participant.id` - ID of the participant. Could be a JID or LID.
            - `participant.lid` - LID of the participant
    - `group.getAdmins()` - Get the list of participants who are admins of the group.
    - `group.getMembers()` - Get the list of participants who are not admins.
    - `group.getLink()` - Get invite link of the group. Errors if the link is hidden from the bot (as a non-admin).

## Receiver Flow
The receivers are checked one by one in order you register them. If two or more receivers can be triggered by the same message, then the one that was registered first will be executed.
```js
// Both of these receivers can be triggered by a message that says "tes123" but only the first one will be triggered
bot.onReceive("tes123", "This will be sent.")
bot.onReceive(/^tes/, "This will not be sent.")
```

In a response function, you can continue the flow to the next receiver using the `next()` function from the 4th argument (now deprecated as 4th argument, it's the 2nd now):
```js
bot.onReceive(/.*/, (ctx, next) => {
    if (userAuthorized(ctx.message.sender.id)) next()
    return "You are not authorized!"
})

bot.onReceive("test", "Hello authorized user!")
```

### Message Modification
The `message` object that is passed to the response functions is the same object. Therefore, you can modify it in a response function, and the modification remains in the subsequent response functions.
```js
bot.onReceive(bot.messageType.any, ({message}, next) => {
    message.watermark = "MyBot"
    next()
})

bot.onReceive("test", ({message}) => {
    return `Brought to you by ${message.watermark}`
})
```

## Message Type Enums
`bot.messageType` has the following enum properties:
- `any`: This is equivalent of regex `/.*/` in receiver input.
- `nonmedia`: This includes `text` and `reaction` messages.
- `media`: This includes `image`, `video`, `gif`, `audio`, `sticker` and `document`.
- Self explanatory: `text`, `reaction`, `image`, `video`, `gif`, `audio`, `sticker`, `document`.

## Tools
You can import tools that can be useful for certain scenarios.
### Commands Tool `require("wachan/commands")`
Useful for quickly setting up prefix-command-params style inputs in popular bot format. Ex: `/search article`
<br>

Exports: `commands`
- `commands` - The Commands Tool. When imported, will add a new item in the settings, `bot.settings.commandPrefixes`, which is an array of prefixes that can be used to invoke commands.
    - `commands.add(name, response, options)` - Add a new command.
        - `name` - The name of the command
        - `response` - String/Object/Function
            - as string: Reply the command message with this.
            - as object: More sending options. [See here](#message-sending-options)
            - as function: `response(context, next)`. [See here](#response-function). There is an additional field in `context` which is `command`.
                - `context`
                    - `context.message` - Message object
                    - `context.command` - Command information
                        - `context.command.prefix` - Prefix that is used when invoking this command
                        - `context.command.name` - Original name of the command.
                        - `context.command.usedName` - The alias name that is used to invoke the command
                        - `context.command.parameters` - Command parameter (in Array). Ex: `/test a b c` -> params = ["a","b","c"]
                        - `context.command.description` - Description of the command
                        - `context.command.aliases` - Alias(es) of this command
                        - `context.command.hidden` - Whether this is a command that is hidden from menu generator.
                        - and any other properties inside `options` when you add this command.
                - `next` - Function to proceed to the next receiver. (See [Receiver Flow](#receiver-flow))
            - as function (old structure, which is deprecated): `response(message, params, command, prefix, group, bot)`
                - `message` - The command message
                - `params` - Parameters of the commands. Example: `/test a b c` -> params = ["a","b","c"]
                - `command` - The command name that is used
                - `prefix` - The prefix that is used
                - `group` - If the chatroom is a group this will be an object that contains information about the group. Else `null`.
                - `bot` - The bot object which is the same as wachan's main export.
        - `options` - Additional options for the command
            - `options.aliases` - Array of aliases for the command
            - `options.separator` - Character to use as parameter string splitter. Default a space (`" "`)
            - `options.description` - Command description
            - `options.sectionName` - Section name of this command. This is used when generating a menu (see below at `commands.generateMenu()`)
            - `options.hidden` - This command will not be shown in the string of the `commands.generateMenu()` function's result.
    - `commands.fromFile(commandName, filePath)` - Add a new command from a file. The file must be a `.js` file exporting a object `cmdFile` with the structure as follows:
        - `cmdFile.response` - Similar to `commands.add()`'s `response` parameter. See above.
        - `cmdFile.options` - Optional. Similar to `commands.add()`'s `options` parameter. See above.
    - `commands.fromFolder(folderPath)` - Scan a folder for command files then add them as commands. The names are taken from the names of the files. See above for the details of a command file.
    - `commands.addPrefix(prefix)` - Add a new command prefix. Like aliases, but for prefix.
    - `commands.removePrefix(prefix)` - Remove one of the existing command prefixes.
    - `commands.getCommandInfo(commandName)` - Get the info about a registered command by its name.
    - `commands.getCommands()` - Get a list of the info of all registered commands.
    - `commands.beforeEach(callback)` - Add a callback that will be executed before executing each command. This is useful for example for authorization (like admin/owner checking)
        - `callback(context, next)` - The callback that will be added
            - `context` - Just like `context` when you add a new command through `commands.add()`
            - `next` - Function to skip to the next callback, or the command that is about to be executed.
    - `commands.generateMenu(options)` - Generate a string of menu that automatically lists all the registered commands and also groups them by their sections. Generation options:
        - `options?.prefix` - The prefix to display. By default the first prefix in the registered prefixes list.
        - `options?.header` - The header or title of the menu. Note: You need to add newlines (`\n`) manually at the end of it if you want to separate the header and the body in their own lines. By default: `"> COMMAND LIST:\n\n"`
        - `options?.sectionTitleFormat` - Use this to format the title of each section. Use `<<section>>` to mark the position of the section title. By default: `"# <<section>>\n"` (Again, manually insert the newlines)
        - `options?.sectionFooter` - The footer of each section. Again, manually insert the newlines but insert them at the beginning. (Ex: `"\n------"`). By default: `""` (empty string)
        - `options?.commandFormat` - The formatting of each command item. Use `<<prefix>>`, `<<name>>`, and `<<description>>` to mark the position of the prefix, command name, and the description, respectively. By default: ``"- `<<prefix>><<name>>`: <<description>>"``
        - `options?.formatter` - Formatter function to use, it takes 1 argument that contains information about the command. If this returns falsy, then `options.commandFormat` will be used.
        - `options?.commandSeparator` - The separator between command items. By default: `"\n"` (a newline)
        - `options?.sectionSeparator` - The separator between sections. By default: `"\n\n"`
        - `options?.unsectionedFirst` - If `true` will show the unsectioned commands before the sectioned ones and vice versa.
        - `options?.noDescriptionPlaceholder` - The string to show if a command has no description.

        This is to show you what the generated menu looks like using default formatting:
```
> COMMAND LIST:

# Section A
- `/cmd1`: Description of the command.
- `/hello`: Say hello.
- `/wachan`: Awesome module.

# Section B
- `/this`: Is an example
- `/you`: Can imagine what it looks like in Whatsapp, I suppose.
- `/nodesc`: No description
```

Example Usage of this tool:
```js
const cmd = require("wachan/commands")
cmd.add("multiply", function (msg, params) {
    const [a, b] = params
    const result = Number(a) * Number(b)
    return `The result of ${a}*${b} is ${result}`
})

// Will respond when someone types:
// /multiply 4 5
// Bot will multiply 4 and 5 then send the result in chat
```

How to use `beforeEach()`:
```js
const cmd = require("wachan/commands")

cmd.beforeEach((context, next) => {
    const { adminOnly } = context.command
    const { isAdmin } = context.message.sender
    
    if (adminOnly && !isAdmin) return `Only admin can use this command!`

    next()
})

cmd.add("special", async (context, next) {
    return "Special command has been executed!"
}, { adminOnly: true })

// When a user types /special, then we will check if they are an admin or not, if not then the command will not be executed
```

### Sticker Tool `require("wachan/sticker")`
You can use this to create WebP stickers that are ready to use in WhatsApp.
<br>Exports: `sticker`
<br><br>`sticker` - The sticker tool
- `sticker.create(input, options)` - Create a new WebP sticker buffer from input.
    - `input` - Can be a string of URL or path, or buffer of image/video
    - `options` - Additional options
        - `options.pack` - The pack name of the sticker. You can see this at the bottom of the sticker preview window in WhatsApp.
        - `options.author` - The author name of the sticker. You can see this at the bottom of the sticker preview window in WhatsApp.
        - `options.size` - The length of one side of the sticker. Default 128 for videos, 512 otherwise. This affects the size of the sticker. And the acceptable sticker file size in Whatsapp is below 1MB.
        - `options.mode` - The image fitting mode:
            - `"crop"` - Crop the sticker into a square area in the center.
            - `"fit"` - Stretch or squeeze the image into a square area.
            - `"all"` - No change. Fit all part of the image in the sticker by zooming out.

Example:
```js
const st = require("wachan/sticker")

const input = "url of your image, or path" // or buffer

const sticker = await st.create(input, {
    pack: "My stickers",
    author: "Me",
    mode: "crop"
})

await bot.sendMessage(targetRoom, { sticker })
```

## Custom Functionality
Exposed are these items for programming custom functionalities.
1. Baileys' socket object: `bot.getSocket()`
2. Message's original object: `message.toBaileys()`
3. `bot.start({ suppressBaileysLogs: false })` to show the logs from baileys
4. `bot.start({ configOverrides: {...} })` to override baileys makeWASocket function parameters.

<hr>
<br>
<br>

# Changelog

## [Unreleased]
### Added
- `bot.showTyping()`
- `bot.showRecording()`
- `group.getLink()`

### Changed
- Updated to baileys v7.0.0-rc12

## [1.15.0] 2026-02-08
### Added
- `bot.getBotData()`
- `message.isPrivate`
- `message.streamMedia()`
- Send media messages using stream objects
- Response function's context argument now contains `group`

### Fixed
- Corrected values for group participants' id and lid

## [1.14.0] 2026-01-16
### Added
- `message.fileName`
- `message.mimeType`
- `message.fileSize`
- `message.duration`
- `message.height`
- `message.width`
- `message.streamMedia()`
- `options.formatter` from `commands.generateMenu(options)`

### Fixed
- Remove `ffmpeg-static` dependency

## [1.13.0] 2026-01-02
### Added
- `context.command.usedName`
- `bot.messageType.vn`
- separated `audio` and `vn` types of messages
- `message.edit()`
- `bot.messageType.edit`
- `message.edited.type`
- `message.edited.text`
- `bot.onReceiveReply()`
### Fixed
- `message.sender.id` and `message.sender.lid` having incorrect values

## [1.12.1] 2025-12-30
### Changed
- Updated baileys version

## [1.12.0] 2025-12-14
### Added
- `bot.getUserData()`
- `cmd.beforeEach()`
- Sending and receiving contacts
- Sending and receiving polls
- `options.configOverrides` in `start()` function
### Fixed
- User's admin status now updates without needing for the program to restart.
- You can now remove a reaction by using an empty string as input
### Deprecated
- Response function arguments will be simplified into 2 arguments: `context` and `next`. This will also be the case for response functions of commands.

## [1.11.0] 2025-11-09
### Added
- `bot.getGroupData()`
- `bot.messageType`
- `bot.onError()`
- `phoneNumber` option in `bot.start(options)`
- New type of message `buttons`
- Function response `next()` function from the 4th argument
- `message.id`
- `message.delete()`
- `message.getQuoted()` is now available in messages with no quoted message, but it returns `null`
- `commands.getCommands()`
- `sticker.create()`'s new option field `size`

## [1.10.0] - 2025-10-26
### Added
- `message.react()`
- Sticker tool: `require("wachan/sticker")`
- 3rd argument in the response function, `group`
- 5th and 6th argument in the command's response function, `group` and `bot`
- A new option field for a command: `options.hidden`
### Fixed
- `message.downloadMedia(saveTo)` no longer needs an existing file to save file

## [1.9.0] - 2025-10-19
### Added
#### Commands Tool (`require("wachan/commands"`)
- Added `commands.fromFile()` and `commands.fromFolder()`
- Added `commands.getCommandInfo()` and `commands.generateMenu()`

## [1.8.0] - 2025-09-08
### Added
- Added Message Store. This will store received messages in memory. The limit can be adjusted in the settings. This is useful to fix some bugs that requires certain messages to be reused.
- Added `bot.settings.messageStoreSize` (default: 1000)
- Added `bot.waitForMessage()`
- Added `message.timestamp`
- Added `message.sender.lid`
- Added `message.getQuoted()`
- Added Commands Tool (`require("wachan/commands")`)
### Fixed
- Updated `Baileys` version to `6.7.19`
- `message.receivedOnline` can now be `false`

## [1.7.0] - 2025-08-23
### Added
- Support sticker message
- Support document message
- `bot.onReceive()` now returns a `Receiver` object.
- `Receiver` objects created from `bot.onReceive()` can be removed using `.remove()` method.
### Fixed
- Sending a message to a @lid id no longer throws an error

## [1.6.0] - 2025-08-12
### Added
- Support video message
- Support gif message
- Support audio message