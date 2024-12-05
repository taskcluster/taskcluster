import random
from collections import Counter

class WeightedRandomConfig:
    def __init__(self):
        self.configs = []
        self.total_weight = 0

    def add_config(self, config, weight):
        if weight < 0 or weight > 1:
            raise ValueError("Weight must be between 0 and 1")
        self.configs.append((config, weight))
        self.total_weight += weight
        self.configs.sort(key=lambda x: x[1], reverse=True)

    def select_random(self):
        if not self.configs:
            return None

        target = random.uniform(0, self.total_weight)
        cumulative_weight = 0
        for config, weight in self.configs:
            cumulative_weight += weight
            if cumulative_weight >= target:
                return config

        # This should never happen, but just in case
        return self.configs[-1][0]

# Example usage:
weighted_config = WeightedRandomConfig()
weighted_config.add_config("config_a", 0.9)
weighted_config.add_config("config_b", 0.5)
weighted_config.add_config("config_c", 0.5)

# Select a random configuration based on the weights
# selected_config = weighted_config.select_random()
# print(selected_config)

# Performance test
num_runs = 100
selections = [weighted_config.select_random() for _ in range(num_runs)]
selection_count = Counter(selections)
print(f"Selection distribution over {num_runs} runs:")
for config, count in selection_count.items():
    print(f"{config}: {count / num_runs * 100:.2f}%")
