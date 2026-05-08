import fitz


def numeric_only(text: str) -> bool:
    t = text.strip().replace(" ", "")
    return bool(t) and t.isdigit()


def fit_fontsize(sample_page, rect, text, rotate, fontname="helv", max_size=14, min_size=6):
    for size in range(max_size, min_size - 1, -1):
        probe = fitz.open()
        p = probe.new_page(width=sample_page.rect.width, height=sample_page.rect.height)
        p.set_rotation(sample_page.rotation)
        result = p.insert_textbox(
            rect,
            text,
            fontsize=size,
            fontname=fontname,
            color=(0, 0, 0),
            rotate=rotate,
            align=0,
        )
        probe.close()
        if result >= 0:
            return size
    return min_size


def render_page(page, translations, rotate):
    blocks = [b for b in page.get_text("blocks") if b[4].strip()]
    translatable = [b for b in blocks if not numeric_only(b[4])]
    if len(translatable) != len(translations):
        raise ValueError(
            f"Translation count mismatch on page {page.number + 1}: "
            f"{len(translatable)} text blocks vs {len(translations)} translations"
        )

    for block, text in zip(translatable, translations):
        x0, y0, x1, y1 = block[:4]
        rect = fitz.Rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
        page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), overlay=True, width=0)
        font_size = fit_fontsize(page, rect, text, rotate=rotate)
        page.insert_textbox(
            rect,
            text,
            fontsize=font_size,
            fontname="helv",
            color=(0, 0, 0),
            rotate=rotate,
            align=0,
        )


BOOKS = {
    "社會1-藻礁保衛戰.pdf": {
        "rotate": 90,
        "output": "社會1-藻礁保衛戰_EN.pdf",
        "pages": {
            1: [
                "Taoyuan City 2021\nEnvironmental Education Picture Book Contest",
                "Text & illustrations by Zhang Yun-chuan",
            ],
            2: [
                "Little Fish Bobo\nShell\nShrimp\nFish",
                "Crab Brother\nSeaweed\nHermit Crab Sister Ling",
                "Shell\nUncle Octopus\nRed-finned Shark\nShell",
                "Sea Turtle",
            ],
            3: [
                "Shoushan Coral\nShell\nSea Lily\nSeaweed",
                "Shell\nNaked Moray Eel\nSea Star\nShell",
                "Bird Mailman\nShoushan Coral\nShell\nShell",
            ],
            4: [
                "Text & illustrations by Zhang Yun-chuan",
            ],
            5: [
                "This is Datan Algal Reef in Taoyuan, one of the few living shallow-sea algal reefs left in the world.",
                "Its porous structure provides homes for fish, shrimp, crabs, and shellfish.",
                "It supports nearly a hundred species and enriches the marine ecosystem.",
                "That is why it is called a \"nursery for marine life.\"",
                "Besides fish, shrimp, crabs, hermit crabs, octopus, shellfish, and sea stars,",
                "you can also find naked moray eels, red-finned sharks, sea lilies, Shoushan coral, green sea turtles, and other rare species.",
            ],
            6: [
                "What is an algal reef? Unlike coral reefs, which are built by animals,",
                "algal reefs are built by plants. Datan Algal Reef is formed mainly by crustose coralline algae.",
                "Through calcification and the buildup of calcium carbonate, it has become a living reef.",
                "Research shows it grows only about 1 cm in 10 years,",
                "and Datan Algal Reef has a history of more than 7,600 years.",
            ],
            7: [
                "On a beautiful morning, little fish Bobo suddenly heard Bird Mailman calling loudly:",
                "\"Anyone home? Anyone home? The Datan Daily has big news today!\"",
            ],
            8: [
                "After delivering the newspaper to Bobo, Bird Mailman continued",
                "to the next house to deliver mail.",
                "Bobo nervously opened the bottle and took out the paper.",
                "The news in the Datan Daily shocked Bobo.",
                "\"What! We're being forced to move!\"",
            ],
            9: [
                "Bobo immediately blew a horn and gathered the seabed residents of Datan Algal Reef.",
                "\"Big news, huge news! This place will become a third natural gas receiving terminal.",
                "Our home is going to be torn down!\"",
                "After hearing the news, the residents turned pale with shock and panic,",
                "asking one another, \"What should we do?",
                "We've lived here so long. Where can we move to?\"",
            ],
            10: [
                "Originally, in response to energy transition policies, the area near Datan Algal Reef",
                "was chosen as a site for a natural gas terminal.",
                "Developing the marine area of the algal reef ecosystem would cause",
                "serious damage and threaten the ecology here.",
                "What should the reef residents, who have lived here for thousands of years, do?",
            ],
            11: [
                "At night, troubled by the moving issue and unable to sleep,",
                "Bobo and his friend looked up at the stars to relax.",
                "Then a shooting star streaked across the distant sky.",
                "\"Look, it's a shooting star!\"",
                "Bobo said excitedly.",
            ],
            12: [
                "Then something magical happened!",
                "The shooting star turned into a fairy and appeared before them, glowing:",
                "\"I heard all your worries.",
                "I am the fairy who protects this algal reef, and I'm here to help you!\"",
                "After hearing her words, Bobo asked curiously,",
                "\"How will you help us? We can only live in the algal reef, not on land.\"",
                "\"Besides moving to another algal reef, what else can we do?\"",
            ],
            14: [
                "\"Good question!\" said the fairy with a smile.",
                "She raised her magic wand and turned Bobo into a little boy.",
                "The hermit crab sister Ling and Crab Brother standing on the reef looked on in surprise.",
                "The fairy warned Bobo: \"You have only three days to live as a human and seek help.",
                "You must return to the sea before sunset on the third day, or you will disappear forever!\"",
                "Then the fairy vanished into the night sky.",
            ],
            15: [
                "The next morning Bobo teamed up with Bird Mailman, Hermit Crab Sister Ling,",
                "and Crab Brother to form the Algal Reef Defense Team",
                "and plan their strategy.",
            ],
            17: [
                "Bobo picked up a branch on the beach and wrote \"SOS\" as a distress call.",
                "Uncle Octopus provided ink so Bobo could write.",
                "Bird Mailman found his friends to help send the letter so many people could see their plea for help.",
            ],
            19: [
                "Under the blazing sun on the beach, Hermit Crab Sister Ling, Crab Brother",
                "and their friends dug out a giant \"SOS\" sign.",
            ],
            22: [
                "Day by day passed.",
                "Before long it was the sunset of the third day.",
                "As the sun was about to sink into the sea, Bobo used his last strength to shout,",
                "\"Help! Help! Someone help!\"",
                "Just then, a person passing by heard Bobo and looked toward him:",
                "\"Look! There is a boy over there who needs help!\"",
            ],
            23: [
                "Humans then realized that the Datan Algal Reef marked for development",
                "is home to countless marine creatures and a rich ecosystem!",
                "They began to ask themselves:",
                "does energy transition really have to sacrifice this precious treasure?",
                "How can we protect life in the sea?",
                "How can we safeguard the ecology of Datan Algal Reef?",
            ],
            24: [
                "Besides caring for the algal reef ecology and not littering,",
                "we can use the far-reaching power of the internet",
                "to share the message with family and friends,",
                "so more people know",
                "that this precious life needs our protection.",
            ],
            25: [
                "We can also use mass media to get the latest news and information",
                "and spread correct conservation messages.",
            ],
            26: [
                "We can also bravely stand up for the algal reef ecology",
                "by joining rallies and demonstrations to uphold justice.",
            ],
            27: [
                "We can gather everyone's strength, sign petitions",
                "to oppose the development of Datan Algal Reef and the construction of a natural gas receiving terminal,",
                "and hold a referendum to practice ecological conservation!",
            ],
            28: [
                "After months of effort...",
            ],
            29: [
                "On yet another beautiful morning, Bird Mailman, as always, delivered letters to every household.",
                "He put his head into the sea and handed the Datan Daily",
                "from the bottle to Bobo.",
                "The seabed residents were stunned to see this, fearing it was another bad news...",
            ],
            30: [
                "It turned out their battle plan succeeded, and they successfully protected their home!",
                "All the residents cheered and rejoiced at not having to move.",
                "Little fish Bobo joyfully leaped out of the water and shouted,",
                "\"Algal Reef Defense Team, mission accomplished!\"",
                "Bird Mailman, Hermit Crab Sister Ling, and Crab Brother looked at Bobo and smiled.",
                "The heavy stone in their hearts was finally lifted, and tonight they could sleep well.",
            ],
            31: [
                "Taoyuan City 2021\nEnvironmental Education Picture Book Contest",
                "Title: Defending the Algal Reef",
                "Issued by: Cheng Wen-tsan",
                "Issuing agency: Taoyuan City Government",
                "Publisher: Taoyuan City Government Environmental Protection Bureau",
                "Text & illustrations: Zhang Yun-chuan",
                "Printing: Dingze Technology Co., Ltd.",
                "ISBN: 978-626-7020-82-1 (hardcover)",
                "Publication date: April 2022",
            ],
        },
    },
    "親子1-海客石滬 - 複製.pdf": {
        "rotate": 0,
        "output": "親子1-海客石滬_EN.pdf",
        "pages": {
            1: [
                "Taoyuan City 2021 Environmental Education Picture Book Contest",
                "Text & illustrations by Xie Hanyun and Ke Lanting",
            ],
            3: [
                "Text & illustrations by Xie Hanyun and Ke Lanting",
            ],
            5: [
                "In the simple Xinnwu District lived many Hakka families",
                "who once made their living from the sea.",
                "Grandma wore a floral jacket and a straw hat,",
                "wrapped her face in a floral cloth,",
                "and walked through the vegetable garden,",
                "pulling up bright orange-red carrots,",
                "busy and cheerful.",
                "Little granddaughter Xiaoli happily helped water the plants.",
            ],
            6: [
                "Xiaoli: \"Grandma! These cabbages are so big",
                "and green,",
                "they must be delicious.\"",
            ],
            7: [
                "\"Xiaoli and your dad both love cabbage,",
                "so tonight Grandma will stir-fry a plate for you.\"",
                "Grandma picked a fresh cabbage.",
            ],
            8: [
                "Xiaoli suddenly looked down sadly,",
                "and tears fell one after another like pearls.",
                "\"What's wrong? Thinking about your dad and mom again?\"",
                "Grandma held Xiaoli in her arms and comforted her.",
            ],
            9: [
                "Grandma lifted the basket full of vegetables,",
                "carrying a bamboo basket in one hand",
                "and Xiaoli in the other.",
                "With a mysterious smile, she said,",
                "\"I'll take you somewhere fun.\"",
                "\"Where?\" Xiaoli stopped crying and asked curiously.",
            ],
            11: [
                "Xiaoli: \"Isn't this the place where you often fish?\"",
                "\"Yes. The coast of Xinnwu has the most stone fish traps in Taiwan.",
                "This one was bought by your great-grandfather,\" Grandma said.",
                "She told the story of the family trap.",
            ],
            12: [
                "\"Why are so many stones piled up to make a stone fish trap?\"",
                "Xiaoli asked in confusion.",
                "\"These are cobblestones.\"",
                "They are stacked with big stones surrounding small stones,\" Grandma said while looking at the trap.",
            ],
            13: [
                "\"Stone fish traps use the tides to catch fish.",
                "When the tide comes in, fish are drawn into the trap.",
                "When the tide goes out,",
                "waves hit the trap.",
                "The big stones stay put,",
                "while the small stones are struck and make noise,",
                "scaring the fish so they cannot escape.\"",
                "Grandma told the story of Hakka stone fish traps in detail.",
                "\"Wow! What a clever method.",
                "It sounds so interesting!\"",
                "Xiaoli admired the wisdom of her ancestors.",
            ],
            14: [
                "After school, A-Hai walked briskly, humming a tune.",
                "He could not wait to rush to his family's stone fish trap",
                "to check today's catch.",
            ],
            15: [
                "As he headed toward the trap,",
                "the smell of fish filled the air.",
                "A-Hai could not help smiling and muttering,",
                "\"What a big catch!\"",
                "He walked quickly.",
            ],
            16: [
                "When the tide came in, schools of fish swam into the stone fish trap;",
                "when the tide went out, the fishermen busied themselves catching fish.",
            ],
            17: [
                "\"Mom, I'm back from school. I'm here to help.\"",
                "\"Good, you're so considerate!\"",
                "Everyone worked in perfect coordination",
                "and quickly lifted the fish into bamboo baskets,",
                "net after net, basket after basket.",
                "Though they were busy and did not stop for a moment, they were filled with joy because they knew today's income would be good.",
            ],
            18: [
                "\"Summer is the peak season for stone fish traps,",
                "and in the past we could catch thousands of catties of fish in a day!\"",
                "\"So many!",
                "What if you couldn't sell them all?\"",
                "\"We'd keep some for ourselves,",
                "and give some to relatives and neighbors,",
                "or dry them",
                "into fish jerky,",
                "so nothing went to waste.",
            ],
            19: [
                "\"How many kinds of fish could you catch at one time?\"",
                "\"Hmm! With one cast of the net,",
                "you could catch more than thirty kinds of fish.\"",
                "\"What about winter?\"",
                "\"In winter there are fewer catches, but you can catch mullet!\"",
                "Grandma talked endlessly about the old life around Hakka stone fish traps,",
                "and Xiaoli listened with great interest.",
            ],
            20: [
                "After school, high school student A-Hai, as always, went",
                "to check the stone fish trap first.",
                "Trash of all kinds floated up and down in the trap with the seawater.",
                "A-Hai said helplessly, \"Marine pollution is getting more and more serious.",
                "There is more trash and fewer fish!\"",
                "After picking up the trash one by one,",
                "he finally managed to catch only two fish.",
            ],
            22: [
                "\"Your dad is very filial.",
                "No matter spring, summer, autumn, or winter, rain or shine,",
                "as soon as school was over, he would first go to the stone fish trap to see whether he could help.",
                "If there was nothing to do, he would still bring fish home.",
                "But now pollution is severe, catches are small, and the stone fish-trap fishing culture can no longer support the fishermen's livelihood,",
                "so your dad left here to work in the city.\"",
            ],
            23: [
                "\"I often think back to the days of fishing with stone traps in the past.",
                "Those busy days are truly worth missing!",
                "Now I still come here every day to check the trap,",
                "and catch fish if I can.",
                "At least I can still have a little taste of the catch.\"",
                "\"This sounds so sad!\"",
            ],
            24: [
                "\"Grandma, I'll help pick up the trash too.\"",
                "Xiaoli felt sorry for the decline of Hakka stone fish-trap culture,",
                "and began picking up the floating trash with Grandma.",
            ],
            26: [
                "\"It's getting late. Let's go home!",
                "For dinner, we have not only delicious cabbage",
                "but also fresh, tasty fish!\"",
            ],
            27: [
                "\"Grandma, the story you told is wonderful! Please take me fishing again tomorrow, okay?\"",
                "Xiaoli was fascinated by the story of the Hakka stone fish traps,",
                "and Grandma nodded with a smile.",
                "\"Who built the stone fish traps?\"",
                "\"How do you repair them if they are damaged?\"",
                "\"How old is this stone fish trap?\"",
                "\"How many stone fish traps are there in Xinnwu?\"",
                "\"How do you calculate the daily high tide time?\" ...",
                "Xiaoli asked one question after another, seemingly forgetting her longing for her parents for the moment.",
            ],
            28: [
                "Taoyuan City 2021\nEnvironmental Education Picture Book Contest",
                "Title: Hakka Stone Fish Trap",
                "Issued by: Cheng Wen-tsan",
                "Issuing agency: Taoyuan City Government",
                "Publisher: Taoyuan City Government Environmental Protection Bureau",
                "Text & illustrations: Xie Hanyun and Ke Lanting",
                "Printing: Dingze Technology Co., Ltd.",
                "ISBN: 978-626-7020-76-0 (hardcover)",
                "Publication date: April 2022",
            ],
            32: [
                "Xinnwu is the place in Taiwan with the most stone fish traps.",
                "It used to be prosperous.",
                "Now marine pollution is worsening and fish catches are declining...",
                "That culture has also faded.",
                "Come and listen to Grandma Hakka tell the story",
                "of the stone fish-trap fishing culture.",
            ],
        },
    },
}


def translate_pdf(src, dst, rotate, page_map):
    doc = fitz.open(src)
    for page_num, translations in page_map.items():
        page = doc.load_page(page_num - 1)
        render_page(page, translations, rotate)
    doc.save(dst)
    doc.close()


def main():
    for src, spec in BOOKS.items():
        translate_pdf(src, spec["output"], spec["rotate"], spec["pages"])
        print(f"wrote {spec['output']}")


if __name__ == "__main__":
    main()
