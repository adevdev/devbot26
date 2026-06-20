module.exports = {
    response: async (context, next) => {
        const { command } = context;
        const params = command.parameters;

        // Default 1d6 (1 dice, 6 sides)
        let numDice = 1;
        let numSides = 6;

        if (params.length > 0) {
            // Parse format: "2d20" or "3d6"
            const match = params[0].match(/^(\d+)d(\d+)$/i);
            if (match) {
                numDice = parseInt(match[1]);
                numSides = parseInt(match[2]);

                // Limits
                if (numDice > 20) numDice = 20;
                if (numSides > 100) numSides = 100;
                if (numDice < 1) numDice = 1;
                if (numSides < 2) numSides = 2;
            }
        }

        // Roll the dice
        const rolls = [];
        let total = 0;

        for (let i = 0; i < numDice; i++) {
            const roll = Math.floor(Math.random() * numSides) + 1;
            rolls.push(roll);
            total += roll;
        }

        const rollsText = rolls.join(', ');

        return `🎲 *Dice Roll*\n\n` +
               `*Dice:* ${numDice}d${numSides}\n` +
               `*Rolls:* ${rollsText}\n` +
               `*Total:* ${total}`;
    },
    options: {
        aliases: ['dice', 'dadu'],
        description: 'Roll dice (usage: .roll 2d20)',
        sectionName: 'Fun'
    }
};
